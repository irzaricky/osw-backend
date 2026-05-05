import db from '../../models/index.js'
import { config } from '../../config/app.config.js'
import { Op, QueryTypes } from 'sequelize'
import helper from '../../class/helper.class.js'
import BaseModule from '../../class/base.module.js'
import ExcelJS from 'exceljs'
import Joi from 'joi'

const { SParts, RefPartTypes, SSuppliers, sequelize } = db

class PartsModule extends BaseModule {
  async dropdown(req, res) {
    try {
      const params = req.query || {}
      const search = (params.search || '').trim()
      const partTypeCode = (params.part_type_code || '').trim()
      const wo_category = (params.wo_category || '').trim()
      const area_id = params.area_id ? parseInt(params.area_id) : null

      let rows

      if (wo_category === 'take_out' && area_id) {
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
          FROM t_warehouse_stock ws
          JOIN s_warehouse_bins b ON b.id = ws.bin_id
          JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
          JOIN t_part_labels label ON label.id = wil.label_id
          JOIN s_parts part ON part.id = label.part_id
          WHERE b.area_id = :area_id ${whereClause}
          GROUP BY part.id, part.part_number, part.part_name, part.part_type_code
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
          available_stock: row.available_stock
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

  async list(req, res) {
    try {
      const params = req.query || {}
      const { limit, page, offset } = helper.getPagination(params)

      const search = params.search || ''
      const part_type_code = params.part_type_code || null
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
          model: SSuppliers,
          as: 'supplier',
          attributes: ['id', 'name', 'supplier_code']
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
        part_number: Joi.string().max(100).required(),
        part_name: Joi.string().max(100).required(),
        part_type_code: Joi.string().max(100).required(),
        supplier_id: Joi.number().integer().required(),
        price: Joi.number().integer().required(),
        safety_stock: Joi.number().integer().required(),
        lead_time_days: Joi.number().integer().required(),
        model_name: Joi.string().max(100).required(),
        model_code: Joi.string().max(100).required(),
        generation: Joi.number().integer().required(),
        color: Joi.string().max(100).required(),
        color_code: Joi.string().max(100).required(),
        uom: Joi.string().max(100).required(),
        package_name: Joi.string().max(100).required(),
        package_code: Joi.string().max(100).required()
      })

      const validation = helper.validate(req.body, schema)
      if (!validation.status) {
        await t.rollback()
        return helper.sendResponse(res, validation)
      }

      const {
        part_number,
        part_name,
        part_type_code,
        supplier_id,
        price,
        safety_stock,
        lead_time_days,
        model_name,
        model_code,
        generation,
        color,
        color_code,
        uom,
        package_name,
        package_code
      } = validation.value

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

      const existingPartType = await RefPartTypes.findOne({
        where: { code: part_type_code, deleted_at: null },
        transaction: t
      })

      if (!existingPartType) {
        await t.rollback()
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: 'Part type not found'
        })
      }

      const existingSupplier = await SSuppliers.findByPk(supplier_id, { transaction: t })
      if (!existingSupplier) {
        await t.rollback()
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: 'Supplier not found'
        })
      }

      let part

      if (existing && existing.deleted_at) {
        const oldData = existing.toJSON()

        await existing.restore({ transaction: t })

        existing.part_number = part_number
        existing.part_name = part_name
        existing.part_type_code = part_type_code
        existing.supplier_id = supplier_id
        existing.price = price
        existing.safety_stock = safety_stock
        existing.lead_time_days = lead_time_days
        existing.model_name = model_name
        existing.model_code = model_code
        existing.generation = generation
        existing.color = color
        existing.color_code = color_code
        existing.uom = uom
        existing.package_name = package_name
        existing.package_code = package_code

        await existing.save({ transaction: t })

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
        part = await SParts.create(
          {
            part_number,
            part_name,
            part_type_code,
            supplier_id,
            price,
            safety_stock,
            lead_time_days,
            model_name,
            model_code,
            generation,
            color,
            color_code,
            uom,
            package_name,
            package_code
          },
          { transaction: t }
        )
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
        part_number: Joi.string().max(100).required(),
        part_name: Joi.string().max(100).required(),
        part_type_code: Joi.string().max(100).required(),
        supplier_id: Joi.number().integer().required(),
        price: Joi.number().integer().required(),
        safety_stock: Joi.number().integer().required(),
        lead_time_days: Joi.number().integer().required(),
        model_name: Joi.string().max(100).required(),
        model_code: Joi.string().max(100).required(),
        generation: Joi.number().integer().required(),
        color: Joi.string().max(100).required(),
        color_code: Joi.string().max(100).required(),
        uom: Joi.string().max(100).required(),
        package_name: Joi.string().max(100).required(),
        package_code: Joi.string().max(100).required()
      })

      const validation = helper.validate(req.body, schema)
      if (!validation.status) {
        await t.rollback()
        return helper.sendResponse(res, validation)
      }

      const {
        part_number,
        part_name,
        part_type_code,
        supplier_id,
        price,
        safety_stock,
        lead_time_days,
        model_name,
        model_code,
        generation,
        color,
        color_code,
        uom,
        package_name,
        package_code
      } = validation.value

      const part = await SParts.findByPk(id, { transaction: t })
      if (!part) {
        await t.rollback()
        return helper.sendResponse(res, {
          status: false,
          code: 404,
          message: 'Part not found'
        })
      }

      const existing = await SParts.findOne({
        where: {
          part_number,
          id: { [Op.ne]: id }
        },
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

      if (existing && existing.deleted_at) {
        await existing.destroy({ force: true, transaction: t })
      }

      const existingSupplier = await SSuppliers.findByPk(supplier_id, { transaction: t })
      if (!existingSupplier) {
        await t.rollback()
        return helper.sendResponse(res, {
          status: false,
          code: 404,
          message: 'Supplier not found'
        })
      }

      const existingPartType = await RefPartTypes.findOne({
        where: { code: part_type_code, deleted_at: null },
        transaction: t
      })

      if (!existingPartType) {
        await t.rollback()
        return helper.sendResponse(res, {
          status: false,
          code: 404,
          message: 'Part type not found'
        })
      }

      const oldData = part.toJSON()

      await part.update(
        {
          part_number,
          part_name,
          part_type_code,
          supplier_id,
          price,
          safety_stock,
          lead_time_days,
          model_name,
          model_code,
          generation,
          color,
          color_code,
          uom,
          package_name,
          package_code
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
        return helper.sendResponse(res, {
          status: false,
          code: 404,
          message: 'Part not found'
        })
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

      const where = { deleted_at: null }

      if (search) {
        where[Op.or] = [
          { part_number: { [Op.iLike]: `%${search}%` } },
          { part_name: { [Op.iLike]: `%${search}%` } }
        ]
      }

      const parts = await SParts.findAll({
        where,
        include: [
          { model: SSuppliers, as: 'supplier', attributes: ['name'] },
          { model: RefPartTypes, as: 'type', attributes: ['name'] }
        ],
        order: [['created_at', 'DESC']]
      })

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Parts')

      worksheet.columns = [
        { header: 'Part Number', key: 'part_number', width: 20 },
        { header: 'Part Name', key: 'part_name', width: 30 },
        { header: 'Part Type', key: 'part_type_name', width: 30 },
        { header: 'Supplier', key: 'supplier_name', width: 30 },
        { header: 'Price', key: 'price', width: 20 },
        { header: 'Safety Stock', key: 'safety_stock', width: 20 },
        { header: 'Lead Time (Days)', key: 'lead_time_days', width: 20 },
        { header: 'Model Name', key: 'model_name', width: 20 },
        { header: 'Model Code', key: 'model_code', width: 20 },
        { header: 'Generation', key: 'generation', width: 15 },
        { header: 'Color', key: 'color', width: 20 },
        { header: 'Color Code', key: 'color_code', width: 20 },
        { header: 'UOM', key: 'uom', width: 15 },
        { header: 'Package Name', key: 'package_name', width: 20 },
        { header: 'Package Code', key: 'package_code', width: 20 }
      ]

      worksheet.getRow(1).font = { bold: true }

      parts.forEach((part) => {
        worksheet.addRow({
          part_number: part.part_number,
          part_name: part.part_name,
          part_type_name: part.type?.name || '',
          supplier_name: part.supplier?.name || '',
          price: part.price,
          safety_stock: part.safety_stock,
          lead_time_days: part.lead_time_days,
          model_name: part.model_name,
          model_code: part.model_code,
          generation: part.generation,
          color: part.color,
          color_code: part.color_code,
          uom: part.uom,
          package_name: part.package_name,
          package_code: part.package_code
        })
      })

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=parts_${new Date().toISOString()}.xlsx`
      )

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

  async upload(req, res) {
    const t = await sequelize.transaction()

    try {
      if (!req.files?.file) {
        await t.rollback()
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: 'File is required'
        })
      }

      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(req.files.file.data)

      const worksheet = workbook.getWorksheet(1)
      if (!worksheet) {
        await t.rollback()
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: 'Invalid Excel format'
        })
      }

      const EXPECTED_HEADERS = [
        'Part Number',
        'Part Name',
        'Part Type',
        'Supplier',
        'Price',
        'Safety Stock',
        'Lead Time (Days)',
        'Model Name',
        'Model Code',
        'Generation',
        'Color',
        'Color Code',
        'UOM'
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
          message: `Invalid template. Expected headers: [${EXPECTED_HEADERS.join(', ')}], but got: [${actualHeaders.join(', ')}]`
        })
      }

      const results = {
        created: 0,
        restored: 0,
        skipped: 0,
        errors: []
      }

      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i)

        const part_number = row.getCell(1).value?.toString().trim() ?? null
        const part_name = row.getCell(2).value?.toString().trim() ?? null
        const part_type_name = row.getCell(3).value?.toString().trim() ?? null
        const supplier_name = row.getCell(4).value?.toString().trim() ?? null
        const price = Number(row.getCell(5).value || 0)
        const safety_stock = Number(row.getCell(6).value || 0)
        const lead_time_days = Number(row.getCell(7).value || 0)
        const model_name = row.getCell(8).value?.toString().trim() ?? null
        const model_code = row.getCell(9).value?.toString().trim() ?? null
        const generation = Number(row.getCell(10).value || 0)
        const color = row.getCell(11).value?.toString().trim() ?? null
        const color_code = row.getCell(12).value?.toString().trim() ?? null
        const uom = row.getCell(13).value?.toString().trim() ?? null

        if (!part_number) {
          results.errors.push({ row: i, message: 'Part Number is required' })
          results.skipped++
          continue
        }

        if (!part_name) {
          results.errors.push({ row: i, message: 'Part Name is required' })
          results.skipped++
          continue
        }

        const partType = part_type_name
          ? await RefPartTypes.findOne({
              where: { name: part_type_name, deleted_at: null },
              transaction: t
            })
          : null

        if (!partType) {
          results.errors.push({ row: i, message: `Part Type "${part_type_name}" not found` })
          results.skipped++
          continue
        }

        const supplier = supplier_name
          ? await SSuppliers.findOne({
              where: { name: supplier_name, deleted_at: null },
              transaction: t
            })
          : null

        if (!supplier) {
          results.errors.push({ row: i, message: `Supplier "${supplier_name}" not found` })
          results.skipped++
          continue
        }

        const existing = await SParts.findOne({
          where: { part_number },
          paranoid: false,
          transaction: t
        })

        if (existing && !existing.deleted_at) {
          results.skipped++
          continue
        }

        if (existing && existing.deleted_at) {
          const oldData = existing.toJSON()

          await existing.restore({ transaction: t })

          existing.part_number = part_number
          existing.part_name = part_name
          existing.part_type_code = partType.code
          existing.supplier_id = supplier.id
          existing.price = price
          existing.safety_stock = safety_stock
          existing.lead_time_days = lead_time_days
          existing.model_name = model_name
          existing.model_code = model_code
          existing.generation = generation
          existing.color = color
          existing.color_code = color_code
          existing.uom = uom

          await existing.save({ transaction: t })

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
          const part = await SParts.create(
            {
              part_number,
              part_name,
              part_type_code: partType.code,
              supplier_id: supplier.id,
              price,
              safety_stock,
              lead_time_days,
              model_name,
              model_code,
              generation,
              color,
              color_code,
              uom
            },
            { transaction: t }
          )

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