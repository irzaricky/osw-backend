import db from '../../models/index.js'
import { config } from '../../config/app.config.js'
import { Op, QueryTypes } from 'sequelize'
import helper from '../../class/helper.class.js'
import BaseModule from '../../class/base.module.js'
import Joi from 'joi'

const { 
  SWarehouseAreas, 
  SWarehouseBins, 
  SWarehouses, 
  RefWarehouseCategories, 
  SAreaLayout, 
  SWorkOrder, 
  SStations,
  RefStationTypes,
  SParts,
  SPackages,
  SPartRoutings,
  SPartRoutingDetails,
  SBoms, 
  SBomDetails, 
  TWorkOrderStoring,
  TWorkOrderStoringItem 
} = db

class WarehouseAreaModule extends BaseModule {
  async list(req) {
    try {
      const params = req.query
      const { limit, page, offset } = helper.getPagination(params)
      const search = params.search || ''
      const warehouse_id = params.warehouse_id

      const where = {}

      if (search) {
        where[Op.or] = [
          { area_code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } }
        ]
      }

      if (warehouse_id) {
        where.warehouse_id = warehouse_id
      }

      const include = [
        {
          model: SWarehouses,
          as: 'warehouse',
          attributes: ['id', 'warehouse_code', 'name'],
          include: [
            {
              model: RefWarehouseCategories,
              as: 'category',
              attributes: ['id', 'name']
            }
          ]
        }
      ]

      const { count, rows } = await SWarehouseAreas.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['deleted_at'] },
        include,
        order: [['created_at', 'DESC']]
      })

      return {
        status: true,
        data: helper.getPaginationData(rows, count, page, limit)
      }
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 }
      return { status: false, message: 'Internal server error', code: 500 }
    }
  }

  async add(req) {
    const t = await db.sequelize.transaction()
    try {
      const schema = Joi.object({
        warehouse_id: Joi.number().integer().required(),
        area_code: Joi.string().max(50).required(),
        name: Joi.string().max(100).required(),
        total_cols: Joi.number().integer().min(1).required(),
        total_rows: Joi.number().integer().min(1).required()
      })

      const validation = helper.validate(req.body, schema)
      if (!validation.status) {
        await t.rollback()
        return validation
      }

      const { warehouse_id, area_code, name, total_cols, total_rows } = validation.value

      
      const warehouse = await SWarehouses.findByPk(warehouse_id, { transaction: t })
      if (!warehouse) {
        await t.rollback()
        return { status: false, message: 'Warehouse not found', code: 404 }
      }

      
      const existing = await SWarehouseAreas.findOne({
        where: { warehouse_id, area_code },
        transaction: t
      })
      if (existing) {
        await t.rollback()
        return {
          status: false,
          message: 'Warehouse Area code already exists in this warehouse',
          code: 409
        }
      }

      
      const newArea = await SWarehouseAreas.create(
        { warehouse_id, area_code, name, total_cols, total_rows },
        { transaction: t }
      )

      
      const binsPayload = []
      for (let r = 1; r <= total_rows; r++) {
        for (let c = 1; c <= total_cols; c++) {
          binsPayload.push({
            area_id: newArea.id,
            row_index: r,
            col_index: c,
            bin_code: `${area_code}-R${r}C${c}`,
            is_dedicated: false,
            dedicated_part_number: null,
            capacity: 0
          })
        }
      }

      
      await SWarehouseBins.bulkCreate(binsPayload, { transaction: t })

      
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: newArea.id,
        newData: newArea,
        description: `Created warehouse area ${area_code} and generated ${binsPayload.length} bins`,
        transaction: t
      })

      await t.commit()

      return {
        status: true,
        data: newArea,
        message: 'Warehouse Area created successfully'
      }
    } catch (error) {
      await t.rollback()
      if (config.debug) return { status: false, error: error.message, code: 500 }
      return { status: false, message: 'Internal server error', code: 500 }
    }
  }

  async update(req) {
    const t = await db.sequelize.transaction()
    try {
      const id = req.params.id

      const schema = Joi.object({
        warehouse_id: Joi.number().integer().optional(),
        area_code: Joi.string().max(50).optional(),
        name: Joi.string().max(100).optional(),
        total_cols: Joi.number().integer().min(1).optional(),
        total_rows: Joi.number().integer().min(1).optional()
      })

      const validation = helper.validate(req.body, schema)
      if (!validation.status) {
        await t.rollback()
        return validation
      }

      const area = await SWarehouseAreas.findByPk(id, { transaction: t })
      if (!area) {
        await t.rollback()
        return { status: false, message: 'Warehouse Area not found', code: 404 }
      }

      const oldData = JSON.parse(JSON.stringify(area))

      
      const oldRows = Number(area.total_rows || 0)
      const oldCols = Number(area.total_cols || 0)

      const { warehouse_id, area_code, name, total_cols, total_rows } = validation.value

      if (warehouse_id) {
        const warehouse = await SWarehouses.findByPk(warehouse_id, { transaction: t })
        if (!warehouse) {
          await t.rollback()
          return { status: false, message: 'Warehouse not found', code: 404 }
        }
        area.warehouse_id = warehouse_id
      }

      if (area_code) area.area_code = area_code
      if (name) area.name = name
      if (total_cols) area.total_cols = total_cols
      if (total_rows) area.total_rows = total_rows

      await area.save({ transaction: t })


      const newRows = Number(area.total_rows || 0)
      const newCols = Number(area.total_cols || 0)

      if (newRows > oldRows || newCols > oldCols) {
        const genRowsFrom = 1
        const genColsFrom = 1


        const addBins = []
        for (let r = genRowsFrom; r <= newRows; r++) {
          for (let c = genColsFrom; c <= newCols; c++) {

            if (r > oldRows || c > oldCols) {
              addBins.push({
                area_id: area.id,
                row_index: r,
                col_index: c,
                bin_code: `${area.area_code}-R${r}C${c}`,
                is_dedicated: false,
                dedicated_part_number: null,
                capacity: 0
              })
            }
          }
        }

        if (addBins.length) {
          await SWarehouseBins.bulkCreate(addBins, { transaction: t })
        }
      }

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: id,
        oldData,
        newData: area,
        description: `Updated warehouse area ${area.area_code}`,
        transaction: t
      })

      await t.commit()

      return {
        status: true,
        data: area,
        message: 'Warehouse Area updated successfully'
      }
    } catch (error) {
      await t.rollback()
      if (config.debug) return { status: false, error: error.message, code: 500 }
      return { status: false, message: 'Internal server error', code: 500 }
    }
  }

  async delete(req) {
    const t = await db.sequelize.transaction()
    try {
      const id = req.params.id

      const area = await SWarehouseAreas.findByPk(id, { transaction: t })
      if (!area) {
        await t.rollback()
        return { status: false, message: 'Warehouse Area not found', code: 404 }
      }

      const oldData = JSON.parse(JSON.stringify(area))


      const usedStock = await db.sequelize.query(`
        SELECT COUNT(ws.id)::int AS total
        FROM t_warehouse_stock ws
        JOIN s_warehouse_bins b
          ON b.id = ws.bin_id
        WHERE b.area_id = :area_id
          AND ws.deleted_at IS NULL
          AND b.deleted_at IS NULL
      `, {
        replacements: { area_id: id },
        type: QueryTypes.SELECT,
        transaction: t
      })

      if (usedStock[0]?.total > 0) {
        await t.rollback()
        return {
          status: false,
          message: 'Warehouse area cannot be deleted because it is already used by active stock',
          code: 400
        }
      }

      await area.destroy({ transaction: t })

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: id,
        oldData,
        description: `Deleted warehouse area ${area.area_code}`,
        transaction: t
      })

      await t.commit()

      return { status: true, message: 'Warehouse Area deleted successfully' }
    } catch (error) {
      await t.rollback()
      if (config.debug) return { status: false, error: error.message, code: 500 }
      return { status: false, message: 'Internal server error', code: 500 }
    }
  }

  async getDropdown(req) {
    try {
      const { category_id, warehouse_id, wo_category, exclude_has_layout, production_wo_id, station_id } = req.query || {}

      // Take Out Flow
      if (category_id && wo_category === 'take_out') {
        let partIds = [];

        // Take Out Supply Production
        if (production_wo_id) {
          const wo = await SWorkOrder.findByPk(
            production_wo_id,
            {
              attributes: ['id', 'part_id', 'planned_quantity']
            }
          );

          if (!wo) {
            return {
              status: false,
              message: 'Production Work Order not found',
              code: 404
            };
          }

          const bom = await SBoms.findOne({
            where: {
              parent_part_id: wo.part_id,
              doc_status_id: 3, // Approved
              activation_status_id: 2 // Active
            },
            include: [
              {
                model: SBomDetails,
                as: 'details',
                required: true,
                where: {
                  type: 'RAW'
                },
                include: [
                  {
                    model: SParts,
                    as: 'part',
                    required: true,
                    attributes: ['id'],
                    include: [
                      {
                        model: SPackages,
                        as: 'package',
                        attributes: ['capacity'],
                      }
                    ]
                  }
                ]
              }
            ]
          });

          if (!bom) {
            return {
              status: false,
              message: 'Active BOM not found',
              code: 404
            };
          }

          const rawMaterials = bom.details.filter(
            detail => detail.type === 'RAW'
          );

          for (const detail of rawMaterials) {
            const requiredQty = Number(detail.qty_required) * Number(wo.planned_quantity);
            const packageCapacity = Number(detail.part?.package?.capacity || 1);

            const suppliedKanban = await TWorkOrderStoringItem.sum(
              'total_kanban',
              {
                include: [
                  {
                    model: TWorkOrderStoring,
                    as: 'work_order',
                    required: true,
                    where: {
                      production_wo_id: wo.id,
                      wo_status_id: {
                        [Op.in]: [2, 3, 4]
                      }
                    }
                  }
                ],
                where: {
                  part_id: detail.part_id
                }
              }
            ) || 0;

            const warehouseSuppliedQty = suppliedKanban * packageCapacity;

            const bufferUsedQty = await TWorkOrderStoringItem.sum(
              'buffer_used_qty_pcs',
              {
                include: [
                  {
                    model: TWorkOrderStoring,
                    as: 'work_order',
                    required: true,
                    where: {
                      production_wo_id: wo.id,
                      wo_status_id: {
                        [Op.in]: [2, 3, 4]
                      }
                    }
                  }
                ],
                where: {
                  part_id: detail.part_id
                }
              }
            ) || 0;

            const suppliedQty = warehouseSuppliedQty + Number(bufferUsedQty);
            const remainingQty = Math.max(requiredQty - suppliedQty, 0);

            if (remainingQty > 0 && !partIds.includes(detail.part_id)) {
              partIds.push(
                detail.part_id
              );
            }
          }
        }

        // Take Out Supply Buffer
        else if (station_id) {
          const routings = await SPartRoutings.findAll({
            where: {
              active: true
            },
            attributes: ['part_id'],
            include: [
              {
                model: SPartRoutingDetails,
                as: 'routing_details',
                required: true,
                attributes: ['station_id', 'sequence'],
                include: [
                  {
                    model: SStations,
                    as: 'station',
                    required: true,
                    include: [
                      {
                        model: RefStationTypes,
                        as: 'station_type',
                        required: true,
                        where: {
                          name: 'ASSEMBLY'
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          });

          const parentPartIds = [];

          for (const routing of routings) {
            const firstAssembly = [...routing.routing_details]
              .sort((a, b) => a.sequence - b.sequence)[0];

            if (!firstAssembly) {
              continue;
            }

            if (firstAssembly.station_id !== Number(station_id)) {
              continue;
            }

            parentPartIds.push(routing.part_id);
          }

          if (!parentPartIds.length) {
            return {
              status: true,
              data: []
            };
          }

          const boms = await SBoms.findAll({
            where: {
              parent_part_id: {
                [Op.in]: parentPartIds
              },
              doc_status_id: 3, // Approved
              activation_status_id: 2 // Active
            },
            include: [
              {
                model: SBomDetails,
                as: 'details',
                required: true,
                where: {
                  type: 'RAW'
                }
              }
            ]
          });

          for (const bom of boms) {
            for (const detail of bom.details) {
              if (!partIds.includes(detail.part_id)) {
                partIds.push(
                  detail.part_id
                );
              }
            }
          }

          if (!partIds.length) {
            return {
              status: true,
              data: []
            };
          }
        }

        const areas = await db.sequelize.query(`
          SELECT DISTINCT 
            wa.id,
            wa.area_code,
            wa.name,
            wh.name AS warehouse_name
          FROM s_warehouse_areas wa
          JOIN s_warehouses wh ON wh.id = wa.warehouse_id AND wh.deleted_at IS NULL
          JOIN s_warehouse_bins b ON b.area_id = wa.id AND b.deleted_at IS NULL
          JOIN t_warehouse_stock ws ON ws.bin_id = b.id AND ws.deleted_at IS NULL
          JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id AND wil.deleted_at IS NULL
          JOIN t_part_labels pl ON pl.id = wil.label_id AND pl.deleted_at IS NULL
          WHERE wa.deleted_at IS NULL AND wh.category_id = :category_id
          ${ partIds.length ? 'AND pl.part_id IN (:partIds)' : '' }
          ORDER BY wa.name ASC
        `, {
          replacements: { 
            category_id,
            ...(partIds.length && { partIds })
          },
          type: QueryTypes.SELECT
        })

        const formatted = areas.map(a => ({
          id: a.id,
          area_code: a.area_code,
          name: a.name,
          warehouse: {
            name: a.warehouse_name
          }
        }))

        return {
          status: true,
          data: formatted
        }
      }

      // Exclude has layout
      let excludeAreaIds = [];

      if (exclude_has_layout === 'true') {
        const usedAreas = await SAreaLayout.findAll({
          attributes: ['area_id']
        });

        excludeAreaIds = usedAreas.map(item => item.area_id);
      }

      const areas = await SWarehouseAreas.findAll({
        attributes: ['id', 'area_code', 'name', 'total_cols', 'total_rows'],
        where: {
          ...(excludeAreaIds.length > 0 && {
            id: {
              [Op.notIn]: excludeAreaIds
            }
          })
        },
        include: [
          {
            model: SWarehouses,
            as: 'warehouse',
            attributes: ['name'],
            required: !!category_id || !!warehouse_id,
            where:
              category_id || warehouse_id
                ? {
                    ...(category_id && { category_id }),
                    ...(warehouse_id && { id: warehouse_id })
                  }
                : undefined
          }
        ],
        order: [['name', 'ASC']]
      })

      return {
        status: true,
        data: areas
      }
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 }
      return { status: false, message: 'Internal server error', code: 500 }
    }
  }
}

export default new WarehouseAreaModule()