import db from '../../models/index.js'
import { config } from '../../config/app.config.js'
import { Op, QueryTypes } from 'sequelize'
import helper from '../../class/helper.class.js'
import BaseModule from '../../class/base.module.js'
import ExcelJS from 'exceljs'
import Joi from 'joi'

const {
  SParts,
  RefPartTypes,
  RefPartCategory,
  SSuppliers,
  SUom,
  SPackages,
  sequelize, TWorkOrderStoring, TWorkOrderStoringItem
} = db

class PartsModule extends BaseModule {
  async dropdown(req, res) {
    try {
      const params = req.query || {}
      const search = (params.search || '').trim()
      const partTypeCode = (params.part_type_code || '').trim()
      const wo_category = (params.wo_category || '').trim()
      const area_id = params.area_id ? parseInt(params.area_id) : null
      const ref_doc_id = params.ref_doc_id ? parseInt(params.ref_doc_id) : null

      let rows

      if (ref_doc_id) {
        const replacements = { ref_doc_id }

        rows = await db.sequelize.query(`
          SELECT
            part.id,
            part.part_number,
            part.part_name,
            part.part_type_code,

            COUNT(DISTINCT mril.id)::int AS source_qty

          FROM t_material_receiving_item mri

          JOIN t_material_receiving_item_label mril
            ON mril.mr_item_id = mri.id
            AND mril.deleted_at IS NULL
            AND mril.is_quantity = true
            AND mril.is_quality = true

          JOIN t_part_labels label
            ON label.id = mril.label_id
            AND label.deleted_at IS NULL

          JOIN s_parts part
            ON part.id = label.part_id
            AND part.deleted_at IS NULL

          WHERE
            mri.deleted_at IS NULL
            AND mri.mr_id = :ref_doc_id

          GROUP BY
            part.id,
            part.part_number,
            part.part_name,
            part.part_type_code

          ORDER BY part.part_number ASC
        `, {
          replacements,
          type: QueryTypes.SELECT
        })

        const formatted = []

        for (const row of rows) {
          const usedQty =
            await TWorkOrderStoringItem.sum(
              'total_kanban',
              {
                include: [
                  {
                    model: TWorkOrderStoring,
                    as: 'work_order',
                    attributes: [],
                    required: true,
                    where: {
                      ref_doc_id,
                      wo_status_id: 2
                    }
                  }
                ],
                where: {
                  part_id: row.id
                }
              }
            ) || 0

          const remainingQty = row.source_qty - usedQty

          if (remainingQty <= 0) continue

          formatted.push({
            id: row.id,
            part_number: row.part_number,
            part_name: row.part_name,
            part_type_code: row.part_type_code,
            remaining_qty: remainingQty
          })
        }

        rows = formatted
      } else if (wo_category === 'take_out' && area_id) {
        let whereClause = ''
        const replacements = { area_id }

        if (partTypeCode) {
          whereClause += ' AND part.part_type_code = :part_type_code'
          replacements.part_type_code = partTypeCode
        }

        if (search) {
          whereClause += ` AND (part.part_number ILIKE :search OR part.part_name ILIKE :search)`
          replacements.search = `%${search}%`
        }

        rows = await db.sequelize.query(`
          SELECT
            part.id,
            part.part_number,
            part.part_name,
            part.part_type_code,
            COUNT(ws.id)::int AS available_stock

            uom.id   AS uom_id,
            uom.code AS uom_code,
            uom.name AS uom_name

          FROM t_warehouse_stock ws
          JOIN s_warehouse_bins b ON b.id = ws.bin_id AND b.deleted_at IS NULL
          JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id AND wil.deleted_at IS NULL
          JOIN t_part_labels label ON label.id = wil.label_id AND label.deleted_at IS NULL
          JOIN s_parts part ON part.id = label.part_id AND part.deleted_at IS NULL
          LEFT JOIN s_uoms uom ON uom.id = part.uom_id
          WHERE ws.deleted_at IS NULL AND b.area_id = :area_id ${whereClause}
          GROUP BY part.id, part.part_number, part.part_name, part.part_type_code, uom.id, uom.code, uom.name
          ORDER BY part.part_number ASC
        `, {
          replacements,
          type: QueryTypes.SELECT
        })

        rows = rows.map(row => ({
          id: row.id,
          part_number: row.part_number,
          part_name: row.part_name,
          part_type_code: row.part_type_code,
          available_stock: row.available_stock,
          uom: row.uom_id
          ? {
              id: row.uom_id,
              code: row.uom_code,
              name: row.uom_name
            }
          : null
        }))
      } else {
        const where = { deleted_at: null }

        if (partTypeCode) {
          where.part_type_code = partTypeCode
        }

        if (search) {
          where[Op.or] = [
            { part_number: { [Op.iLike]: `%${search}%` } },
            { part_name: { [Op.iLike]: `%${search}%` } }
          ]
        }

        rows = await SParts.findAll({
          where,
          attributes: ['id', 'part_number', 'part_name', 'part_type_code'],
          include: [
            {
              model: SUom,
              as: 'uom',
              attributes: ['id', 'code', 'name'],
              required: false
            }
          ],
          order: [['part_number', 'ASC']]
        })
      }

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: rows
      })
    } catch (error) {
      console.log('[PartsModule][dropdown]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal Server Error'
      })
    }
  }

  async ddPartTypes(req, res) {
    try {
      const partTypes = await RefPartTypes.findAll({
        where: { deleted_at: null },
        attributes: ['id', 'code', 'name'],
        order: [['name', 'ASC']]
      })

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: partTypes
      })
    } catch (error) {
      console.log('[PartsModule][ddPartTypes]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error'
      })
    }
  }

  async ddPartCategories(req, res) {
    try {
      const categories = await RefPartCategory.findAll({
        where: { deleted_at: null },
        attributes: ['id', 'code', 'name'],
        order: [['name', 'ASC']]
      })

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: categories
      })
    } catch (error) {
      console.log('[PartsModule][ddPartCategories]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error'
      })
    }
  }

  async ddPackages(req, res) {
    try {
      const packages = await SPackages.findAll({
        where: { deleted_at: null },
        attributes: ['id', 'package_code', 'name'],
        order: [['name', 'ASC']]
      })

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: packages
      })
    } catch (error) {
      console.log('[PartsModule][ddPackages]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error'
      })
    }
  }

  async list(req, res) {
    try {
      const params = req.query || {}
      const { limit, page, offset } = helper.getPagination(params)

      const search = params.search || ''
      const part_type_code = params.part_type_code || null
      const part_category_id = params.part_category_id || null
      const supplier_id = params.supplier_id || null

      const where = { deleted_at: null }

      if (search) {
        where[Op.or] = [
          { part_number: { [Op.iLike]: `%${search}%` } },
          { part_name: { [Op.iLike]: `%${search}%` } }
        ]
      }

      if (part_type_code) {
        where.part_type_code = part_type_code
      }

      if (part_category_id) {
        where.part_category_id = part_category_id
      }

      if (supplier_id) {
        where.supplier_id = supplier_id
      }

      const include = [
        {
          model: RefPartTypes,
          as: 'type',
          attributes: ['code', 'name']
        },
        {
          model: RefPartCategory,
          as: 'category',
          attributes: ['id', 'code', 'name']
        },
        {
          model: SSuppliers,
          as: 'supplier',
          attributes: ['id', 'name', 'supplier_code']
        },
        {
          model: SUom,
          as: 'uom',
          attributes: ['id', 'code', 'name']
        },
        {
          model: SPackages,
          as: 'package',
          attributes: ['id', 'package_code', 'name']
        }
      ]

      const { count, rows } = await SParts.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['deleted_at'] },
        include,
        order: [['created_at', 'DESC']]
      })

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit)
      })
    } catch (error) {
      console.log('[PartsModule][list]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error'
      })
    }
  }

  async add(req, res) {
    const t = await sequelize.transaction()

    try {
      const schema = Joi.object({
        part_number:      Joi.string().max(100).required(),
        part_name:        Joi.string().max(255).required(),
        part_type_code:   Joi.string().max(50).required(),
        part_category_id: Joi.number().integer().required(),
        supplier_id:      Joi.number().integer().optional().allow(null),
        uom_id:           Joi.number().integer().required(),
        package_id:       Joi.number().integer().optional().allow(null),
        price:            Joi.number().optional().allow(null),
        safety_stock:     Joi.number().integer().min(0).required(),
        lead_time_days:   Joi.number().integer().min(0).required(),
        model_name:       Joi.string().max(50).optional().allow('', null),
        model_code:       Joi.string().max(50).optional().allow('', null),
        generation:       Joi.string().max(20).optional().allow('', null),
        color:            Joi.string().max(50).optional().allow('', null),
        color_code:       Joi.string().max(20).optional().allow('', null),
      })

      const validation = helper.validate(req.body, schema)
      if (!validation.status) {
        await t.rollback()
        return helper.sendResponse(res, validation)
      }

      const {
        part_number, part_name, part_type_code, part_category_id,
        supplier_id, uom_id, package_id, price, safety_stock,
        lead_time_days, model_name, model_code, generation, color, color_code
      } = validation.value

      // Cek duplikasi part number
      const existing = await SParts.findOne({
        where: { part_number },
        paranoid: false,
        transaction: t
      })

      if (existing && !existing.deleted_at) {
        await t.rollback()
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: 'Part number already exists'
        })
      }

      // Validasi referensi
      const existingPartType = await RefPartTypes.findOne({
        where: { code: part_type_code, deleted_at: null },
        transaction: t
      })
      if (!existingPartType) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 400, message: 'Part type not found' })
      }

      const existingCategory = await RefPartCategory.findOne({
        where: { id: part_category_id, deleted_at: null },
        transaction: t
      })
      if (!existingCategory) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 400, message: 'Part category not found' })
      }

      const existingUom = await SUom.findOne({
        where: { id: uom_id, deleted_at: null },
        transaction: t
      })
      if (!existingUom) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 400, message: 'UOM not found' })
      }

      if (supplier_id) {
        const existingSupplier = await SSuppliers.findByPk(supplier_id, { transaction: t })
        if (!existingSupplier) {
          await t.rollback()
          return helper.sendResponse(res, { status: false, code: 400, message: 'Supplier not found' })
        }
      }

      const partData = {
        part_number, part_name, part_type_code, part_category_id,
        supplier_id: supplier_id || null,
        uom_id, package_id: package_id || null,
        price: price || null,
        safety_stock, lead_time_days,
        model_name: model_name || null,
        model_code: model_code || null,
        generation: generation || null,
        color: color || null,
        color_code: color_code || null,
      }

      let part

      if (existing && existing.deleted_at) {
        const oldData = existing.toJSON()
        await existing.restore({ transaction: t })
        await existing.update(partData, { transaction: t })
        part = existing

        await this.logActivity(req, {
          moduleCode: 'master-data',
          activityCode: 'RESTORE',
          resourceId: existing.id,
          oldData,
          newData: existing,
          description: `Restored part ${part_name}`,
          transaction: t
        })
      } else {
        part = await SParts.create(partData, { transaction: t })
      }

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: part.id,
        newData: part,
        description: `Created part ${part_name}`,
        transaction: t
      })

      await t.commit()

      return helper.sendResponse(res, {
        status: true,
        code: 201,
        message: 'Part created successfully',
        data: part
      })
    } catch (error) {
      await t.rollback()
      console.log('[PartsModule][add]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error'
      })
    }
  }

  async update(req, res) {
    const t = await sequelize.transaction()

    try {
      const { id } = req.params

      const schema = Joi.object({
        part_number:      Joi.string().max(100).required(),
        part_name:        Joi.string().max(255).required(),
        part_type_code:   Joi.string().max(50).required(),
        part_category_id: Joi.number().integer().required(),
        supplier_id:      Joi.number().integer().optional().allow(null),
        uom_id:           Joi.number().integer().required(),
        package_id:       Joi.number().integer().optional().allow(null),
        price:            Joi.number().optional().allow(null),
        safety_stock:     Joi.number().integer().min(0).required(),
        lead_time_days:   Joi.number().integer().min(0).required(),
        model_name:       Joi.string().max(50).optional().allow('', null),
        model_code:       Joi.string().max(50).optional().allow('', null),
        generation:       Joi.string().max(20).optional().allow('', null),
        color:            Joi.string().max(50).optional().allow('', null),
        color_code:       Joi.string().max(20).optional().allow('', null),
      })

      const validation = helper.validate(req.body, schema)
      if (!validation.status) {
        await t.rollback()
        return helper.sendResponse(res, validation)
      }

      const {
        part_number, part_name, part_type_code, part_category_id,
        supplier_id, uom_id, package_id, price, safety_stock,
        lead_time_days, model_name, model_code, generation, color, color_code
      } = validation.value

      const part = await SParts.findByPk(id, { transaction: t })
      if (!part) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 404, message: 'Part not found' })
      }

      // Cek duplikasi part number (exclude diri sendiri)
      const duplicate = await SParts.findOne({
        where: { part_number, id: { [Op.ne]: id } },
        paranoid: false,
        transaction: t
      })
      if (duplicate && !duplicate.deleted_at) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 400, message: 'Part number already exists' })
      }
      if (duplicate && duplicate.deleted_at) {
        await duplicate.destroy({ force: true, transaction: t })
      }

      // Validasi referensi
      const existingPartType = await RefPartTypes.findOne({
        where: { code: part_type_code, deleted_at: null },
        transaction: t
      })
      if (!existingPartType) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 404, message: 'Part type not found' })
      }

      const existingCategory = await RefPartCategory.findOne({
        where: { id: part_category_id, deleted_at: null },
        transaction: t
      })
      if (!existingCategory) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 404, message: 'Part category not found' })
      }

      const existingUom = await SUom.findOne({
        where: { id: uom_id, deleted_at: null },
        transaction: t
      })
      if (!existingUom) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 404, message: 'UOM not found' })
      }

      if (supplier_id) {
        const existingSupplier = await SSuppliers.findByPk(supplier_id, { transaction: t })
        if (!existingSupplier) {
          await t.rollback()
          return helper.sendResponse(res, { status: false, code: 404, message: 'Supplier not found' })
        }
      }

      const oldData = part.toJSON()

      await part.update(
        {
          part_number, part_name, part_type_code, part_category_id,
          supplier_id: supplier_id || null,
          uom_id, package_id: package_id || null,
          price: price || null,
          safety_stock, lead_time_days,
          model_name: model_name || null,
          model_code: model_code || null,
          generation: generation || null,
          color: color || null,
          color_code: color_code || null,
        },
        { transaction: t }
      )

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: part.id,
        oldData,
        newData: part,
        description: `Updated part ${part_name}`,
        transaction: t
      })

      await t.commit()

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        message: 'Part updated successfully',
        data: part
      })
    } catch (error) {
      await t.rollback()
      console.log('[PartsModule][update]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error'
      })
    }
  }

  async delete(req, res) {
    const t = await sequelize.transaction()

    try {
      const { id } = req.params

      const part = await SParts.findByPk(id, { transaction: t })
      if (!part) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 404, message: 'Part not found' })
      }

      const oldData = part.toJSON()
      await part.destroy({ transaction: t })

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: part.id,
        oldData,
        description: `Deleted part ${part.part_name}`,
        transaction: t
      })

      await t.commit()

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        message: 'Part deleted successfully'
      })
    } catch (error) {
      await t.rollback()
      console.log('[PartsModule][delete]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error'
      })
    }
  }

  async download(req, res) {
    try {
      const params = req.query || {}
      const search = params.search || ''
      const part_type_code = params.part_type_code || null
      const part_category_id = params.part_category_id || null
      const supplier_id = params.supplier_id || null

      const where = { deleted_at: null }

      if (search) {
        where[Op.or] = [
          { part_number: { [Op.iLike]: `%${search}%` } },
          { part_name: { [Op.iLike]: `%${search}%` } }
        ]
      }
      if (part_type_code) where.part_type_code = part_type_code
      if (part_category_id) where.part_category_id = part_category_id
      if (supplier_id) where.supplier_id = supplier_id

      const parts = await SParts.findAll({
        where,
        include: [
          { model: SSuppliers,       as: 'supplier',      attributes: ['name'] },
          { model: RefPartTypes,     as: 'type',     attributes: ['name'] },
          { model: RefPartCategory,as: 'category', attributes: ['name'] },
          { model: SUom,            as: 'uom',           attributes: ['code', 'name'] },
          { model: SPackages,        as: 'package',       attributes: ['package_code', 'name'] }
        ],
        order: [['created_at', 'DESC']]
      })

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Parts')

      worksheet.columns = [
        { header: 'Part Number',      key: 'part_number',     width: 20 },
        { header: 'Part Name',        key: 'part_name',       width: 30 },
        { header: 'Part Type',        key: 'type',       width: 20 },
        { header: 'Category',         key: 'category',   width: 20 },
        { header: 'Supplier',         key: 'supplier',        width: 30 },
        { header: 'UOM',              key: 'uom',             width: 10 },
        { header: 'Package',          key: 'package',         width: 25 },
        { header: 'Price',            key: 'price',           width: 20 },
        { header: 'Safety Stock',     key: 'safety_stock',    width: 15 },
        { header: 'Lead Time (Days)', key: 'lead_time_days',  width: 18 },
        { header: 'Model Name',       key: 'model_name',      width: 20 },
        { header: 'Model Code',       key: 'model_code',      width: 15 },
        { header: 'Generation',       key: 'generation',      width: 12 },
        { header: 'Color',            key: 'color',           width: 20 },
        { header: 'Color Code',       key: 'color_code',      width: 15 }
      ]

      worksheet.getRow(1).font = { bold: true }

      parts.forEach((part) => {
        worksheet.addRow({
          part_number:    part.part_number,
          part_name:      part.part_name,
          part_type:      part.part_type?.name || '',
          part_category:  part.part_category?.name || '',
          supplier:       part.supplier?.name || '',
          uom:            part.uom?.code || '',
          package:        part.package ? `${part.package.name} (${part.package.package_code})` : '',
          price:          part.price,
          safety_stock:   part.safety_stock,
          lead_time_days: part.lead_time_days,
          model_name:     part.model_name,
          model_code:     part.model_code,
          generation:     part.generation,
          color:          part.color,
          color_code:     part.color_code
        })
      })

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename=parts_${new Date().toISOString()}.xlsx`)

      await workbook.xlsx.write(res)
      res.end()
    } catch (error) {
      console.log('[PartsModule][download]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error'
      })
    }
  }

  // Upload tidak diubah strukturnya karena perlu diskusi template Excel baru
  // (package_name/package_code dihapus, perlu diganti package_code untuk lookup SPackages)
  async upload(req, res) {
    const t = await sequelize.transaction()

    try {
      if (!req.files?.file) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 400, message: 'File is required' })
      }

      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(req.files.file.data)

      const worksheet = workbook.getWorksheet(1)
      if (!worksheet) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 400, message: 'Invalid Excel format' })
      }

      const EXPECTED_HEADERS = [
        'Part Number', 'Part Name', 'Part Type', 'Category',
        'Supplier', 'UOM', 'Package Code',
        'Price', 'Safety Stock', 'Lead Time (Days)',
        'Model Name', 'Model Code', 'Generation', 'Color', 'Color Code'
      ]

      const headerRow = worksheet.getRow(1)
      const actualHeaders = EXPECTED_HEADERS.map(
        (_, i) => headerRow.getCell(i + 1).value?.toString().trim() ?? ''
      )
      const isValidTemplate = EXPECTED_HEADERS.every(
        (expected, i) => actualHeaders[i].toLowerCase() === expected.toLowerCase()
      )

      if (!isValidTemplate) {
        await t.rollback()
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: `Invalid template. Expected: [${EXPECTED_HEADERS.join(', ')}], got: [${actualHeaders.join(', ')}]`
        })
      }

      const results = { created: 0, restored: 0, skipped: 0, errors: [] }

      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i)

        const part_number    = row.getCell(1).value?.toString().trim() ?? null
        const part_name      = row.getCell(2).value?.toString().trim() ?? null
        const part_type_name = row.getCell(3).value?.toString().trim() ?? null
        const category_name  = row.getCell(4).value?.toString().trim() ?? null
        const supplier_name  = row.getCell(5).value?.toString().trim() ?? null
        const uom_code       = row.getCell(6).value?.toString().trim() ?? null
        const package_code   = row.getCell(7).value?.toString().trim() ?? null
        const price          = Number(row.getCell(8).value || 0)
        const safety_stock   = Number(row.getCell(9).value || 0)
        const lead_time_days = Number(row.getCell(10).value || 0)
        const model_name     = row.getCell(11).value?.toString().trim() ?? null
        const model_code     = row.getCell(12).value?.toString().trim() ?? null
        const generation     = row.getCell(13).value?.toString().trim() ?? null
        const color          = row.getCell(14).value?.toString().trim() ?? null
        const color_code     = row.getCell(15).value?.toString().trim() ?? null

        if (!part_number || !part_name) {
          results.errors.push({ row: i, message: 'Part Number and Part Name are required' })
          results.skipped++
          continue
        }

        const partType = part_type_name
          ? await RefPartTypes.findOne({ where: { name: part_type_name, deleted_at: null }, transaction: t })
          : null
        if (!partType) {
          results.errors.push({ row: i, message: `Part Type "${part_type_name}" not found` })
          results.skipped++
          continue
        }

        const category = category_name
          ? await RefPartCategory.findOne({ where: { name: category_name, deleted_at: null }, transaction: t })
          : null
        if (!category) {
          results.errors.push({ row: i, message: `Category "${category_name}" not found` })
          results.skipped++
          continue
        }

        const uom = uom_code
          ? await SUom.findOne({ where: { code: uom_code, deleted_at: null }, transaction: t })
          : null
        if (!uom) {
          results.errors.push({ row: i, message: `UOM "${uom_code}" not found` })
          results.skipped++
          continue
        }

        const supplier = supplier_name
          ? await SSuppliers.findOne({ where: { name: supplier_name, deleted_at: null }, transaction: t })
          : null

        const pkg = package_code
          ? await SPackages.findOne({ where: { package_code, deleted_at: null }, transaction: t })
          : null

        const existing = await SParts.findOne({
          where: { part_number },
          paranoid: false,
          transaction: t
        })

        if (existing && !existing.deleted_at) {
          results.skipped++
          continue
        }

        const partData = {
          part_number, part_name,
          part_type_code: partType.code,
          part_category_id: category.id,
          supplier_id: supplier?.id || null,
          uom_id: uom.id,
          package_id: pkg?.id || null,
          price, safety_stock, lead_time_days,
          model_name, model_code, generation, color, color_code
        }

        if (existing && existing.deleted_at) {
          const oldData = existing.toJSON()
          await existing.restore({ transaction: t })
          await existing.update(partData, { transaction: t })

          await this.logActivity(req, {
            moduleCode: 'master-data',
            activityCode: 'RESTORE',
            resourceId: existing.id,
            oldData,
            newData: existing,
            description: `Restored part via upload (${part_number})`,
            transaction: t
          })
          results.restored++
        } else {
          const part = await SParts.create(partData, { transaction: t })

          await this.logActivity(req, {
            moduleCode: 'master-data',
            activityCode: 'CREATE',
            resourceId: part.id,
            newData: part,
            description: `Created part via upload (${part_number})`,
            transaction: t
          })
          results.created++
        }
      }

      await t.commit()

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        message: 'Upload completed',
        data: results
      })
    } catch (error) {
      await t.rollback()
      console.log('[PartsModule][upload]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error'
      })
    }
  }
}

export default new PartsModule()