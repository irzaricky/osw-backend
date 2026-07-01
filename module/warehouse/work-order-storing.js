import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op, fn, col, QueryTypes, where as sequelizeWhere } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import PdfPrinter from 'pdfmake/src/printer.js';
import QRCode from 'qrcode';
import dayjs from 'dayjs';
import path from 'path';

const { 
  SUsers,
  SUserDetail,
  SUom,
  SParts,
  SPartRoutings,
  SPartRoutingDetails,
  SPartRoutingDetailMaterials,
  SRoutingStationMaterial,
  SStations,
  RefStationTypes,
  SPackages,
  SWarehouseAreas,
  SSuppliers,
  SBoms,
  SBomDetails,
  SWorkOrder,
  SWorkOrderStation,
  SWorkOrderMaterial,
  TWorkOrderStoring, 
  TWorkOrderStoringItem, 
  TWorkOrderStoringItemLabel, 
  RefWorkOrderStoringStatus, 
  RefWorkOrderStoringType, 
  TPartLabels,
  RefReceivingStatus,
  TMaterialReceiving, 
  TMaterialReceivingItem, 
  TMaterialReceivingItemLabel, 
  SMaterialDeliveryOrder, 
  TMaterialDeliveryOrderDetail,
  TStationBufferStock
} = db;

class WorkOrderStoringModule extends BaseModule {
  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';
      const wo_status_id = params.wo_status_id;
      const wo_category = params.wo_category;
      const start_date = params.start_date;
      const end_date = params.end_date;

      const where = {};

      if (search) {
        where.wo_number = { [Op.iLike]: `%${search}%` };
      }

      if (wo_status_id) {
        where.wo_status_id = wo_status_id;
      }

      if (wo_category) {
        where.wo_category = wo_category;
      }

      if (start_date && end_date) {
        where[Op.and] = [
          sequelizeWhere(
            fn('DATE', col('wo_date')),
            {
              [Op.between]: [start_date, end_date]
            }
          )
        ];
      } else if (start_date) {
        where[Op.and] = [
          sequelizeWhere(
            fn('DATE', col('wo_date')),
            {
              [Op.gte]: start_date
            }
          )
        ];
      } else if (end_date) {
        where[Op.and] = [
          sequelizeWhere(
            fn('DATE', col('wo_date')),
            {
              [Op.lte]: end_date
            }
          )
        ];
      }

      const include = [
        {
          model: RefWorkOrderStoringStatus,
          as: 'status',
          attributes: ['id', 'name']
        },
        {
          model: RefWorkOrderStoringType,
          as: 'type',
          attributes: ['id', 'name']
        },
        {
          model: SWarehouseAreas,
          as: 'area',
          attributes: ['id', 'name']
        },
        {
          model: SUsers,
          as: 'user',
          attributes: ['id', 'email'],
          include: [
            {
              model: SUserDetail,
              as: 'user_detail',
              attributes: ['full_name']
            }
          ]
        }
      ]

      const { count, rows } = await TWorkOrderStoring.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['ref_doc_id', 'wo_status_id', 'wo_type_id', 'deleted_at'] },
        include,
        order: [['created_at', 'DESC']]
      });

      return {
        status: true,
        data: helper.getPaginationData(rows, count, page, limit)
      };
    } catch (error) {
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async detail(req) {
    try {
      const id = req.params.id;

      const workOrder = await TWorkOrderStoring.findByPk(id, {
        attributes: { exclude: ['wo_status_id', 'wo_type_id', 'warehouse_area_id', 'created_by', 'deleted_at'] },
        include: [
          {
            model: RefWorkOrderStoringStatus,
            as: 'status',
            attributes: ['id', 'name']
          },
          {
            model: RefWorkOrderStoringType,
            as: 'type',
            attributes: ['id', 'name']
          },
          {
            model: TMaterialReceiving,
            as: 'ref_doc',
            attributes: ['id'],
            include: [
              {
                model: SMaterialDeliveryOrder,
                as: 'mdo',
                attributes: ['id', 'number']
              }
            ]
          },
          {
            model: SWarehouseAreas,
            as: 'area',
            attributes: ['id', 'name']
          },
          {
            model: TWorkOrderStoringItem,
            as: 'items',
            attributes: ['id', 'part_id', 'total_kanban'],
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['id', 'part_number', 'part_name']
              }
            ]
          }
        ]
      });

      if (!workOrder) {
        return {
          status: false,
          message: 'Work Order Storing not found',
          code: 404
        };
      }

      return {
        status: true,
        data: workOrder
      };

    } catch (error) {
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async validateBufferItems(stationId, items, transaction) {
    const routingDetails = await SPartRoutingDetails.findAll({
      where: {
        station_id: stationId
      },
      include: [
        {
          model: SPartRoutings,
          as: 'routing',
          required: true,
          where: {
            active: true,
            is_default: true
          }
        },
        {
          model: SPartRoutingDetailMaterials,
          as: 'materials',
          required: true,
          include: [
            {
              model: SParts,
              as: 'part',
              required: true,
              where: {
                part_type_code: 'RAW'
              }
            }
          ]
        }
      ],
      transaction
    });
  
    if (!routingDetails.length) {
      throw new Error('No material configured for this station');
    }
  
    const allowedPartIds = new Set();
  
    for (const detail of routingDetails) {
      for (const material of detail.materials) {
        allowedPartIds.add(material.part_id);
      }
    }
  
    const partIds = items.map(item => item.part_id);
  
    const parts = await SParts.findAll({
      where: {
        id: {
          [Op.in]: partIds
        }
      },
      include: [
        {
          model: SPackages,
          as: 'package',
          attributes: ['id', 'capacity']
        }
      ],
      transaction
    });
  
    const partMap = new Map(parts.map(part => [part.id, part]));
  
    const itemResults = [];
  
    for (const item of items) {
      if (!allowedPartIds.has(item.part_id)) {
        throw new Error(`Part ${item.part_id} is not allowed for selected station`);
      }
  
      const part = partMap.get(item.part_id);
  
      if (!part) {
        throw new Error(`Part ${item.part_id} not found`);
      }
  
      const capacity = Number(part.package?.capacity || 1);
      const qtyPcs = Number(item.total_kanban) * capacity;
  
      itemResults.push({
        part_id: item.part_id,
        buffer_used_qty_pcs: 0,
        buffer_added_qty_pcs: qtyPcs
      });
    }
  
    return itemResults;
  }

  async validateProductionTakeOut({production_wo_id, station_id, items, transaction}) {
    const itemResults = [];

    const woStation = await SWorkOrderStation.findOne({
      where: {
        wo_id: production_wo_id,
        station_id
      },
      transaction
    });

    if (!woStation) {
      throw new Error(
        'Production Work Order Station not found'
      );
    }

    const woMaterials = await SWorkOrderMaterial.findAll({
      where: {
        wo_station_id: woStation.id
      },
      include: [
        {
          model: SParts,
          as: 'material_part',
          required: true,
          where: {
            part_type_code: 'RAW'
          },
          include: [
            {
              model: SPackages,
              as: 'package',
              attributes: ['id', 'capacity']
            }
          ]
        }
      ],
      transaction
    });

    if (!woMaterials.length) {
      throw new Error(
        'Station has no material requirement'
      );
    }

    const materialMap = new Map();

    for (const material of woMaterials) {
      materialMap.set(
        material.material_part_id,
        material
      );
    }

    for (const item of items) {
      const material = materialMap.get(
        item.part_id
      );

      if (!material) {
        throw new Error(
          `Part ${item.part_id} is not required by this station`
        );
      }

      const part = material.material_part;

      const capacity = Number(part.package?.capacity || 1);
      const requiredQty = Number(material.planned_quantity);

      const suppliedKanban = await TWorkOrderStoringItem.sum(
        'total_kanban',
        {
          include: [
            {
              model: TWorkOrderStoring,
              as: 'work_order',
              attributes: [],
              required: true,
              where: {
                production_wo_id,
                station_id,
                take_out_purpose: 'production',
                wo_status_id: {
                  [Op.in]: [2, 3, 4]
                }
              }
            }
          ],
          where: {
            part_id: item.part_id
          },
          transaction
        }
      ) || 0;

      const warehouseSuppliedQty = suppliedKanban * capacity;

      const bufferUsedQty = await TWorkOrderStoringItem.sum(
        'buffer_used_qty_pcs',
        {
          include: [
            {
              model: TWorkOrderStoring,
              as: 'work_order',
              attributes: [],
              required: true,
              where: {
                production_wo_id,
                station_id,
                take_out_purpose: 'production',
                wo_status_id: {
                  [Op.in]: [2, 3, 4]
                }
              }
            }
          ],
          where: {
            part_id: item.part_id
          },
          transaction
        }
      ) || 0;

      const suppliedQty = warehouseSuppliedQty + Number(bufferUsedQty);
      const remainingQty = Math.max(requiredQty - suppliedQty, 0);

      if (remainingQty <= 0) {
        throw new Error(
          `Part ${part.part_number} already fully supplied`
        );
      }

      const requestedQty = item.total_kanban * capacity;
      const remainingAfterSupply = remainingQty - requestedQty;

      if (remainingAfterSupply === 0) {
        itemResults.push({
          part_id: item.part_id,
          buffer_used_qty_pcs: 0,
          buffer_added_qty_pcs: 0
        });

        continue;
      }

      if (remainingAfterSupply >= capacity) {
        itemResults.push({
          part_id: item.part_id,
          buffer_used_qty_pcs: 0,
          buffer_added_qty_pcs: 0
        });

        continue;
      }

      if (remainingAfterSupply > 0 && remainingAfterSupply < capacity) {
        const bufferStock = await TStationBufferStock.findOne({
          where: {
            station_id,
            part_id: item.part_id
          },
          transaction
        });

        const bufferQty = Number(bufferStock?.qty_pcs || 0);

        if (bufferQty >= remainingAfterSupply) {
          itemResults.push({
            part_id: item.part_id,
            buffer_used_qty_pcs: remainingAfterSupply,
            buffer_added_qty_pcs: 0
          });

          continue;
        }

        throw new Error(
          `Part ${part.part_number} still requires ${remainingAfterSupply} pcs but buffer stock only has ${bufferQty} pcs. Please take 1 more kanban.`
        );
      }

      if (remainingAfterSupply < 0) {
        const overSupplyQty = Math.abs(remainingAfterSupply);

        if (overSupplyQty >= capacity) {
          throw new Error(
            `Part ${part.part_number} exceeds remaining requirement`
          );
        }

        itemResults.push({
          part_id: item.part_id,
          buffer_used_qty_pcs: 0,
          buffer_added_qty_pcs: overSupplyQty
        });

        continue;
      }
    }
    return itemResults;
  }

  async add(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;

      const schema = Joi.object({
        wo_category: Joi.string().valid('Placement', 'Take Out').required(),
        ref_doc_id: Joi.number().integer().allow(null),
        ref_doc_number: Joi.string().allow('', null),
        ref_doc_name: Joi.string().allow('', null),
        wo_date: Joi.date().required(),
        wo_description: Joi.string().allow('', null),
        wo_type_id: Joi.number().integer().required(),
        warehouse_area_id: Joi.number().integer().required(),
        wo_status_id: Joi.number().integer().valid(1, 2).required(),
        take_out_purpose: Joi.string().valid('production', 'buffer').allow(null),
        production_wo_id: Joi.number().integer().allow(null),
        station_id: Joi.number().integer().allow(null),

        items: Joi.array().items(
          Joi.object({
            part_id: Joi.number().integer().required(),
            total_kanban: Joi.number().min(1).required()
          })
        ).min(1).required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const value = validation.value;

      let itemResults = [];

      try {
        await helper.checkExists(SWarehouseAreas, value.warehouse_area_id, 'Warehouse Area', t);
        await helper.checkExists(RefWorkOrderStoringType, value.wo_type_id, 'Work Order Type', t);
      } catch (err) {
        await t.rollback();
        return err;
      }

      if (value.wo_category === 'Take Out' && value.wo_type_id === 1) {
        if (!value.take_out_purpose) {
          await t.rollback();
          return {
            status: false,
            message: 'Take Out Purpose is required for Raw Material Take Out',
            code: 400
          };
        }

        if (value.take_out_purpose === 'buffer') {
          if (!value.station_id) {
            await t.rollback();
            return {
              status: false,
              message: 'Station is required when Take Out Purpose is Buffer',
              code: 400
            };
          }

          try {
            await helper.checkExists(SStations, value.station_id, 'Station', t);
            itemResults = await this.validateBufferItems(
              value.station_id,
              value.items,
              t
            );
          } catch (err) {
            await t.rollback();
            return {
              status: false,
              message: err.message,
              code: 400
            };
          }
        }

        if (value.take_out_purpose === 'production') {
          if (!value.production_wo_id) {
            await t.rollback();
            return {
              status: false,
              message: 'Production Work Order is required when Take Out Purpose is Production',
              code: 400
            };
          }

          if (!value.station_id) {
            await t.rollback();
            return {
              status: false,
              message: 'Station is required when Take Out Purpose is Production',
              code: 400
            };
          }

          try {
            await helper.checkExists(SStations, value.station_id, 'Station', t);
            const productionWO = await SWorkOrder.findByPk(
              value.production_wo_id,
              {
                attributes: ['id', 'wo_number', 'status'],
                transaction: t
              }
            );

            if (!productionWO) {
              await t.rollback();
              return {
                status: false,
                message: 'Production Work Order not found',
                code: 404
              };
            }

            if (!['Released', 'In_Progress'].includes(productionWO.status)) {
              await t.rollback();
              return {
                status: false,
                message: 'Production Work Order is not active',
                code: 400
              };
            }

            const woStation = await SWorkOrderStation.findOne({
              attributes: ['id'],
              where: {
                wo_id: value.production_wo_id,
                station_id: value.station_id
              },
              transaction: t
            });

            if (!woStation) {
              await t.rollback();
              return {
                status: false,
                message: 'Selected station is not part of Production Work Order',
                code: 400
              };
            }

            itemResults = await this.validateProductionTakeOut({
              production_wo_id: value.production_wo_id,
              station_id: value.station_id,
              items: value.items,
              transaction: t
            });

            value.ref_doc_number = productionWO.wo_number;
            value.ref_doc_name = 'Production Work Order';
          } catch (err) {
            await t.rollback();
            return {
              status: false,
              message: err.message,
              code: err.code || 400
            };
          }
        }
      }

      if (value.ref_doc_id) {
        // Placement only
        if (value.wo_category !== 'Placement') {
          await t.rollback();

          return {
            status: false,
            message: 'Delivery Order only available for Placement',
            code: 400
          };
        }

        // Raw Material only
        const workOrderType = await RefWorkOrderStoringType.findByPk(
          value.wo_type_id,
          {
            attributes: ['name'],
            transaction: t
          }
        );

        if (!workOrderType || workOrderType.name !== 'Raw Materials') {
          await t.rollback();

          return {
            status: false,
            message: 'Delivery Order only available for Raw Materials type',
            code: 400
          };
        }

        const receiving = await TMaterialReceiving.findByPk(
          value.ref_doc_id,
          {
            include: [
              {
                model: SMaterialDeliveryOrder,
                as: 'mdo',
                attributes: ['id', 'number']
              },
              {
                model: RefReceivingStatus,
                as: 'status',
                attributes: ['name']
              }
            ],
            transaction: t
          }
        );

        if (!receiving) {
          await t.rollback();

          return {
            status: false,
            message: 'Material Delivery Order not found',
            code: 404
          };
        }

        if (receiving.status?.name !== 'Good Receipt') {
          await t.rollback();

          return {
            status: false,
            message: 'Delivery Order must be Good Receipt',
            code: 400
          };
        }

        // auto fill
        value.ref_doc_number = receiving.mdo?.number || '-';
        value.ref_doc_name = 'Material Delivery Order';

        for (const item of value.items) {
          const validLabelCount =
            await TMaterialReceivingItemLabel.count({
              include: [
                {
                  model: TMaterialReceivingItem,
                  as: 'material_receiving_item',
                  required: true,
                  where: {
                    mr_id: value.ref_doc_id
                  }
                },
                {
                  model: TPartLabels,
                  as: 'label',
                  required: true,
                  where: {
                    part_id: item.part_id
                  }
                }
              ],
              where: {
                is_quantity: true,
                is_quality: true
              },
              transaction: t
            });

          const usedQty = await TWorkOrderStoringItem.sum(
            'total_kanban',
              {
                include: [
                  {
                    model: TWorkOrderStoring,
                    as: 'work_order',
                    attributes: [],
                    required: true,
                    where: {
                      ref_doc_id: value.ref_doc_id,
                      wo_status_id: {
                        [Op.in]: [2, 3, 4]
                      }
                    }
                  }
                ],
                where: {
                  part_id: item.part_id
                },
                transaction: t
              }
            ) || 0;

          const remainingQty = validLabelCount - usedQty;

          if (item.total_kanban > remainingQty) {
            await t.rollback();

            return {
              status: false,
              message: `Remaining qty for part ${item.part_id} is only ${remainingQty}`,
              code: 400
            };
          }
        }
      }

      // Validate stock for Take Out
      if (value.wo_category === 'Take Out') {
        for (const item of value.items) {
          const stockResult = await db.sequelize.query(`
            SELECT COUNT(ws.id)::int AS total_kanban
            FROM t_warehouse_stock ws
            JOIN s_warehouse_bins b ON b.id = ws.bin_id AND b.deleted_at IS NULL
            JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id AND wil.deleted_at IS NULL
            JOIN t_part_labels label ON label.id = wil.label_id AND label.deleted_at IS NULL
            WHERE ws.deleted_at IS NULL AND b.area_id = :area_id AND label.part_id = :part_id
          `, {
            replacements: { area_id: value.warehouse_area_id, part_id: item.part_id },
            type: QueryTypes.SELECT,
            transaction: t
          });

          const availableStock = stockResult[0]?.total_kanban || 0;
          if (item.total_kanban > availableStock) {
            await t.rollback();
            return {
              status: false,
              message: `Insufficient stock for part ${item.part_id}. Requested: ${item.total_kanban}, Available: ${availableStock}`,
              code: 400
            };
          }
        }
      }

      // Generate wo number
      const dateStr = dayjs().format('YYMMDD');

      const prefix =
        value.wo_type_id === 1 ? 'M' :
        value.wo_type_id === 2 ? 'W' : 'F';

      const woPrefix = `WO-${prefix}-${dateStr}-`;

      const lastWO = await TWorkOrderStoring.findOne({
        where: {
          wo_number: {
            [Op.like]: `${woPrefix}%`
          }
        },
        order: [['wo_number', 'DESC']],
        transaction: t
      });

      let nextNumber = 1;

      if (lastWO) {
        const lastSeq = parseInt(lastWO.wo_number.split('-').pop(), 10);
        nextNumber = lastSeq + 1;
      }

      const wo_number = `${woPrefix}${String(nextNumber).padStart(3, '0')}`;

      const existing = await TWorkOrderStoring.findOne({
        where: { wo_number },
        paranoid: false,
        transaction: t
      });

      let workOrder;

      if (existing && existing.deleted_at) {
        await existing.restore({ transaction: t });

        await existing.update({
          wo_category: value.wo_category,
          take_out_purpose: value.take_out_purpose,
          production_wo_id: value.production_wo_id,
          station_id: value.station_id,
          ref_doc_id: value.ref_doc_id,
          ref_doc_number: value.ref_doc_number,
          ref_doc_name: value.ref_doc_name,
          wo_date: value.wo_date,
          wo_description: value.wo_description,
          wo_type_id: value.wo_type_id,
          warehouse_area_id: value.warehouse_area_id,
          wo_status_id: value.wo_status_id,
          created_by: req.user?.id
        }, { transaction: t });

        workOrder = existing;

        const oldItems = await TWorkOrderStoringItem.findAll({
          where: { wo_id: existing.id },
          attributes: ['id'],
          paranoid: false,
          transaction: t
        });

        const oldItemIds = oldItems.map(i => i.id);

        if (oldItemIds.length) {
          await TWorkOrderStoringItemLabel.destroy({
            where: { wo_item_id: { [Op.in]: oldItemIds } },
            force: true,
            transaction: t
          });
        }

        await TWorkOrderStoringItem.destroy({
          where: { wo_id: existing.id },
          force: true,
          transaction: t
        });
      } else if (existing && !existing.deleted_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Work Order number already exists',
          code: 409
        };
      } else {
        workOrder = await TWorkOrderStoring.create({
          wo_number,
          wo_category: value.wo_category,
          take_out_purpose: value.take_out_purpose,
          production_wo_id: value.production_wo_id,
          station_id: value.station_id,
          ref_doc_id: value.ref_doc_id,
          ref_doc_number: value.ref_doc_number,
          ref_doc_name: value.ref_doc_name,
          wo_date: value.wo_date,
          wo_description: value.wo_description,
          wo_type_id: value.wo_type_id,
          warehouse_area_id: value.warehouse_area_id,
          wo_status_id: value.wo_status_id,
          created_by: req.user?.id
        }, { transaction: t });
      }

      const resultMap = new Map(
        itemResults.map(
          result => [
            result.part_id, result
          ]
        )
      );
      
      const items = value.items.map(item => {
        const result = resultMap.get(item.part_id);

        return {
          wo_id: workOrder.id,
          part_id: item.part_id,
          total_kanban: item.total_kanban,

          buffer_used_qty_pcs: result?.buffer_used_qty_pcs || 0,
          buffer_added_qty_pcs: result?.buffer_added_qty_pcs || 0
        };
      });

      const createdItems = await TWorkOrderStoringItem.bulkCreate(
        items, 
        {
          transaction: t,
          returning: true
        }
      );

      if (value.wo_status_id === 2 && value.wo_category === 'Placement' && value.ref_doc_id) {
        const labels = [];

        for (const item of createdItems) {
          const receivingLabels = await TMaterialReceivingItemLabel.findAll({
            attributes: ['id', 'label_id'],
            include: [
              {
                model: TMaterialReceivingItem,
                as: 'material_receiving_item',
                required: true,
                where: {
                  mr_id: value.ref_doc_id
                }
              },
              {
                model: TPartLabels,
                as: 'label',
                required: true,
                where: {
                  part_id: item.part_id
                }
              }
            ],
            where: {
              is_quantity: true,
              is_quality: true
            },
            limit: item.total_kanban,
            order: [['id', 'ASC']],
            transaction: t
          });

          for (const receivingLabel of receivingLabels) {
            labels.push({
              wo_item_id: item.id,
              label_id: receivingLabel.label_id
            });
          }
        }

        if (labels.length) {
          await TWorkOrderStoringItemLabel.bulkCreate(labels, {
            transaction: t
          });
        }
      }

      if (value.wo_status_id === 2 && value.wo_category === 'Placement' && !value.ref_doc_id) {
        const labels = [];

        for (const item of createdItems) {
          const part = await SParts.findByPk(item.part_id, { transaction: t });

          if (!part) {
            throw {
              status: false,
              message: `Part with id ${item.part_id} not found`,
              code: 404
            };
          }

          const labelPrefix = `WO-${part.part_number}-${dateStr}-`;

          const lastLabel = await TPartLabels.findOne({
            where: {
              label_number: { [Op.like]: `${labelPrefix}%` }
            },
            order: [['label_number', 'DESC']],
            transaction: t
          });

          let nextNumber = 1;

          if (lastLabel) {
            const lastSeq = parseInt(lastLabel.label_number.split('-').pop(), 10);
            nextNumber = lastSeq + 1;
          }

          for (let i = 0; i < item.total_kanban; i++) {
            const labelNumber = `${labelPrefix}${String(nextNumber + i).padStart(6, '0')}`;

            const newLabel = await TPartLabels.create({
              label_number: labelNumber,
              part_id: item.part_id
            }, { transaction: t });

            labels.push({
              wo_item_id: item.id,
              label_id: newLabel.id
            });
          }
        }

        if (labels.length) {
          await TWorkOrderStoringItemLabel.bulkCreate(labels, { transaction: t });
        }
      }

      await t.commit();

      return {
        status: true,
        message: existing ? 'Work Order restored & recreated' : 'Work Order created successfully',
        data: workOrder
      };
    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async update(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;
      const data = req.body;

      const schema = Joi.object({
        wo_category: Joi.string().valid('Placement', 'Take Out').required(),
        ref_doc_id: Joi.number().integer().allow(null),
        ref_doc_number: Joi.string().allow('', null),
        ref_doc_name: Joi.string().allow('', null),
        wo_date: Joi.date().required(),
        wo_description: Joi.string().allow('', null),
        wo_type_id: Joi.number().integer().required(),
        warehouse_area_id: Joi.number().integer().required(),
        wo_status_id: Joi.number().integer().valid(1, 2).required(),
        take_out_purpose: Joi.string().valid('production', 'buffer').allow(null),
        production_wo_id: Joi.number().integer().allow(null),
        station_id: Joi.number().integer().allow(null),

        items: Joi.array().items(
          Joi.object({
            part_id: Joi.number().integer().required(),
            total_kanban: Joi.number().min(1).required()
          })
        ).min(1).required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const value = validation.value;

      let itemResults = [];

      const workOrder = await TWorkOrderStoring.findByPk(id, { transaction: t });

      if (!workOrder) {
        await t.rollback();
        return {
          status: false,
          message: 'Work Order not found',
          code: 404
        };
      }

      if (workOrder.wo_status_id !== 1) {
        await t.rollback();
        return {
          status: false,
          message: 'Only Draft Work Order can be edited',
          code: 400
        };
      }

      try {
        await helper.checkExists(SWarehouseAreas, value.warehouse_area_id, 'Warehouse Area', t);
        await helper.checkExists(RefWorkOrderStoringType, value.wo_type_id, 'Work Order Type', t);
      } catch (err) {
        await t.rollback();
        return err;
      }

      if (value.wo_category === 'Take Out' && value.wo_type_id === 1) {
        if (!value.take_out_purpose) {
          await t.rollback();
          return {
            status: false,
            message: 'Take Out Purpose is required for Raw Material Take Out',
            code: 400
          };
        }

        if (value.take_out_purpose === 'buffer') {
          if (!value.station_id) {
            await t.rollback();
            return {
              status: false,
              message: 'Station is required when Take Out Purpose is Buffer',
              code: 400
            };
          }

          try {
            await this.validateFirstAssemblyBufferStation(value.station_id, t);
            itemResults = await this.validateBufferItems(
              value.station_id,
              value.items,
              t
            );
          } catch (err) {
            await t.rollback();
            return {
              status: false,
              message: err.message,
              code: 400
            };
          }
        }

        if (value.take_out_purpose === 'production') {
          if (!value.production_wo_id) {
            await t.rollback();
            return {
              status: false,
              message: 'Production Work Order is required when Take Out Purpose is Production',
              code: 400
            };
          }

          if (!value.station_id) {
            await t.rollback();
            return {
              status: false,
              message: 'Station is required when Take Out Purpose is Production',
              code: 400
            };
          }

          try {
            await helper.checkExists(SStations, value.station_id, 'Station', t);
            const productionWO = await SWorkOrder.findByPk(
              value.production_wo_id,
              {
                attributes: ['id', 'wo_number', 'status'],
                transaction: t
              }
            );

            if (!productionWO) {
              await t.rollback();
              return {
                status: false,
                message: 'Production Work Order not found',
                code: 404
              };
            }

            if (!['Released', 'In_Progress'].includes(productionWO.status)) {
              await t.rollback();
              return {
                status: false,
                message: 'Production Work Order is not active',
                code: 400
              };
            }

            const woStation = await SWorkOrderStation.findOne({
              attributes: ['id'],
              where: {
                wo_id: value.production_wo_id,
                station_id: value.station_id
              },
              transaction: t
            });

            if (!woStation) {
              await t.rollback();
              return {
                status: false,
                message: 'Selected station is not part of Production Work Order',
                code: 400
              };
            }

            itemResults = await this.validateProductionTakeOut({
              production_wo_id: value.production_wo_id,
              station_id: value.station_id,
              items: value.items,
              transaction: t
            });

            value.ref_doc_number = productionWO.wo_number;
            value.ref_doc_name = 'Production Work Order';
          } catch (err) {
            await t.rollback();
            return {
              status: false,
              message: err.message,
              code: err.code || 400
            };
          }
        }
      }

      if (value.ref_doc_id) {
        // Placement only
        if (value.wo_category !== 'Placement') {
          await t.rollback();

          return {
            status: false,
            message: 'Delivery Order only available for Placement',
            code: 400
          };
        }

        // Raw Material only
        const workOrderType = await RefWorkOrderStoringType.findByPk(
          value.wo_type_id,
          {
            attributes: ['name'],
            transaction: t
          }
        );

        if (!workOrderType || workOrderType.name !== 'Raw Materials') {
          await t.rollback();

          return {
            status: false,
            message: 'Delivery Order only available for Raw Materials type',
            code: 400
          };
        }

        const receiving = await TMaterialReceiving.findByPk(
          value.ref_doc_id,
          {
            include: [
              {
                model: SMaterialDeliveryOrder,
                as: 'mdo',
                attributes: ['id', 'number']
              },
              {
                model: RefReceivingStatus,
                as: 'status',
                attributes: ['name']
              }
            ],
            transaction: t
          }
        );

        if (!receiving) {
          await t.rollback();

          return {
            status: false,
            message: 'Material Delivery Order not found',
            code: 404
          };
        }

        if (receiving.status?.name !== 'Good Receipt') {
          await t.rollback();

          return {
            status: false,
            message: 'Delivery Order must be Good Receipt',
            code: 400
          };
        }

        // auto fill
        value.ref_doc_number = receiving.mdo?.number || '-';
        value.ref_doc_name = 'Material Delivery Order';

        for (const item of value.items) {
          const validLabelCount =
            await TMaterialReceivingItemLabel.count({
              include: [
                {
                  model: TMaterialReceivingItem,
                  as: 'material_receiving_item',
                  required: true,
                  where: {
                    mr_id: value.ref_doc_id
                  }
                },
                {
                  model: TPartLabels,
                  as: 'label',
                  required: true,
                  where: {
                    part_id: item.part_id
                  }
                }
              ],
              where: {
                is_quantity: true,
                is_quality: true
              },
              transaction: t
            });

          const usedQty = await TWorkOrderStoringItem.sum(
            'total_kanban',
              {
                include: [
                  {
                    model: TWorkOrderStoring,
                    as: 'work_order',
                    attributes: [],
                    required: true,
                    where: {
                      ref_doc_id: value.ref_doc_id,
                      wo_status_id: 2
                    }
                  }
                ],
                where: {
                  part_id: item.part_id
                },
                transaction: t
              }
            ) || 0;

          const remainingQty = validLabelCount - usedQty;
          
          if (item.total_kanban > remainingQty) {
            await t.rollback();

            return {
              status: false,
              message: `Remaining qty for part ${item.part_id} is only ${remainingQty}`,
              code: 400
            };
          }
        }
      }

      // Validate stock for Take Out
      if (value.wo_category === 'Take Out') {
        for (const item of value.items) {
          const stockResult = await db.sequelize.query(`
            SELECT COUNT(ws.id)::int AS total_kanban
            FROM t_warehouse_stock ws
            JOIN s_warehouse_bins b ON b.id = ws.bin_id AND b.deleted_at IS NULL
            JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id AND wil.deleted_at IS NULL
            JOIN t_part_labels label ON label.id = wil.label_id AND label.deleted_at IS NULL
            WHERE ws.deleted_at IS NULL AND b.area_id = :area_id AND label.part_id = :part_id
          `, {
            replacements: { area_id: value.warehouse_area_id, part_id: item.part_id },
            type: QueryTypes.SELECT,
            transaction: t
          });

          const availableStock = stockResult[0]?.total_kanban || 0;
          if (item.total_kanban > availableStock) {
            await t.rollback();
            return {
              status: false,
              message: `Insufficient stock for part ID ${item.part_id}. Requested: ${item.total_kanban}, Available: ${availableStock}`,
              code: 400
            };
          }
        }
      }

      await workOrder.update({
        wo_category: value.wo_category,
        take_out_purpose: value.take_out_purpose,
        production_wo_id: value.production_wo_id,
        station_id: value.station_id,
        ref_doc_id: value.ref_doc_id,
        ref_doc_number: value.ref_doc_number,
        ref_doc_name: value.ref_doc_name,
        wo_date: value.wo_date,
        wo_description: value.wo_description,
        wo_type_id: value.wo_type_id,
        warehouse_area_id: value.warehouse_area_id,
        wo_status_id: value.wo_status_id
      }, { transaction: t });

      const existingItems = await TWorkOrderStoringItem.findAll({
        where: { wo_id: id },
        transaction: t
      });

      const existingMap = new Map();

      existingItems.forEach(item => {
        existingMap.set(item.part_id, item);
      });

      const incomingPartIds = value.items.map(i => i.part_id);

      const updatedItems = [];

      const resultMap = new Map(
        itemResults.map(result => [
          result.part_id, result
        ])
      );

      for (const newItem of value.items) {
        const existing = existingMap.get(newItem.part_id);
        const result = resultMap.get(newItem.part_id);

        if (existing) {
          await existing.update({
            total_kanban: newItem.total_kanban,
            buffer_used_qty_pcs: result?.buffer_used_qty_pcs || 0,
            buffer_added_qty_pcs: result?.buffer_added_qty_pcs || 0
          }, { transaction: t });

          updatedItems.push(existing);
        } else {
          const created = await TWorkOrderStoringItem.create({
            wo_id: id,
            part_id: newItem.part_id,
            total_kanban: newItem.total_kanban,
            buffer_used_qty_pcs: result?.buffer_used_qty_pcs || 0,
            buffer_added_qty_pcs: result?.buffer_added_qty_pcs || 0
          }, { transaction: t });

          updatedItems.push(created);
        }
      }

      const itemsToDelete = existingItems.filter(item =>
        !incomingPartIds.includes(item.part_id)
      );

      const deleteIds = itemsToDelete.map(i => i.id);

      if (deleteIds.length) {
        await TWorkOrderStoringItemLabel.destroy({
          where: { wo_item_id: { [Op.in]: deleteIds } },
          transaction: t
        });

        await TWorkOrderStoringItem.destroy({
          where: { id: { [Op.in]: deleteIds } },
          transaction: t
        });
      }

      if (value.wo_status_id === 2 && value.wo_category === 'Placement' && value.ref_doc_id) {
        const labels = [];

        for (const item of updatedItems) {
          const receivingLabels = await TMaterialReceivingItemLabel.findAll({
            attributes: ['id', 'label_id'],
            include: [
              {
                model: TMaterialReceivingItem,
                as: 'material_receiving_item',
                required: true,
                where: {
                  mr_id: value.ref_doc_id
                }
              },
              {
                model: TPartLabels,
                as: 'label',
                required: true,
                where: {
                  part_id: item.part_id
                }
              }
            ],
            where: {
              is_quantity: true,
              is_quality: true
            },
            limit: item.total_kanban,
            order: [['id', 'ASC']],
            transaction: t
          });

          for (const receivingLabel of receivingLabels) {
            labels.push({
              wo_item_id: item.id,
              label_id: receivingLabel.label_id
            });
          }
        }

        if (labels.length) {
          await TWorkOrderStoringItemLabel.bulkCreate(labels, {
            transaction: t
          });
        }
      }
      
      if (value.wo_status_id === 2 && value.wo_category === 'Placement' && !value.ref_doc_id) {
        const labels = [];

        const dateStr = dayjs(workOrder.created_at).format('YYMMDD');

        for (const item of updatedItems) {
          const part = await SParts.findByPk(item.part_id, { transaction: t });

          if (!part) {
            throw {
              status: false,
              message: `Part with id ${item.part_id} not found`,
              code: 404
            };
          }

          const labelPrefix = `WO-${part.part_number}-${dateStr}-`;

          const lastLabel = await TPartLabels.findOne({
            where: {
              label_number: { [Op.like]: `${labelPrefix}%` }
            },
            order: [['label_number', 'DESC']],
            transaction: t
          });

          let nextNumber = 1;

          if (lastLabel) {
            const lastSeq = parseInt(lastLabel.label_number.split('-').pop(), 10);
            nextNumber = lastSeq + 1;
          }

          for (let i = 0; i < item.total_kanban; i++) {
            const labelNumber = `${labelPrefix}${String(nextNumber + i).padStart(6, '0')}`;

            const newLabel = await TPartLabels.create({
              label_number: labelNumber,
              part_id: item.part_id
            }, { transaction: t });

            labels.push({
              wo_item_id: item.id,
              label_id: newLabel.id
            });
          }
        }

        if (labels.length) {
          await TWorkOrderStoringItemLabel.bulkCreate(labels, { transaction: t });
        }
      }

      await t.commit();

      return {
        status: true,
        message: 'Work Order updated successfully',
        data: workOrder
      };
    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async delete(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;

      const workOrder = await TWorkOrderStoring.findByPk(id, {
        transaction: t
      });

      if (!workOrder) {
        await t.rollback();
        return {
          status: false,
          message: 'Work Order not found',
          code: 404
        };
      }

      if (![1, 2].includes(workOrder.wo_status_id)) {
        await t.rollback();
        return {
          status: false,
          message: 'Only Draft or Submitted Work Order can be deleted',
          code: 400
        };
      }

      const items = await TWorkOrderStoringItem.findAll({
        where: { wo_id: id },
        attributes: ['id'],
        transaction: t
      });

      const itemIds = items.map(i => i.id);

      if (itemIds.length) {
        await TWorkOrderStoringItemLabel.destroy({
          where: {
            wo_item_id: { [Op.in]: itemIds }
          },
          transaction: t
        });
      }

      await TWorkOrderStoringItem.destroy({
        where: { wo_id: id },
        transaction: t
      });

      await workOrder.destroy({ transaction: t });

      await t.commit();

      return {
        status: true,
        message: 'Work Order deleted successfully'
      };

    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async printLabel(req, res) {
    try {
      const { wo_item_id } = req.params;

      const item = await TWorkOrderStoringItem.findByPk(wo_item_id, {
        attributes: ['id'],
        include: [
          {
            model: TWorkOrderStoring,
            as: 'work_order',
            attributes: ['wo_number']
          },
          {
            model: TWorkOrderStoringItemLabel,
            as: 'item_labels',
            attributes: ['id'],
            include: [
              {
                model: TPartLabels,
                as: 'label',
                attributes: ['label_number'],
                include: [
                  {
                    model: SParts,
                    as: 'part',
                    attributes: ['part_number', 'part_name'],
                    include: [
                      {
                        model: SSuppliers,
                        as: 'supplier',
                        attributes: ['name']
                      },
                      {
                        model: SPackages,
                        as: 'package',
                        attributes: ['capacity']
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!item) {
        return res.status(404).json({
          status: false,
          message: 'Work Order Item not found'
        });
      }

      if (!item.item_labels || item.item_labels.length === 0) {
        return res.status(400).json({
          status: false,
          message: 'No labels found'
        });
      }

      const workOrder = item.work_order;
      const part = item.item_labels[0]?.label?.part;

      if (!part) {
        return res.status(400).json({
          status: false,
          message: 'Part not found'
        });
      }

      const printedAt = dayjs().format('DD/MM/YYYY HH:mm:ss');

      const fonts = {
        Roboto: {
          normal: path.resolve('fonts/Roboto-Regular.ttf'),
          bold: path.resolve('fonts/Roboto-Medium.ttf'),
          bolditalics: path.resolve('fonts/Roboto-MediumItalic.ttf')
        }
      };

      const printer = new PdfPrinter(fonts);

      const labelItems = [];

      for (const labelData of item.item_labels) {
        const label = labelData.label;
        if (!label) continue;

        labelItems.push({
          unbreakable: true,
          border: [1, 1, 1, 1],
          borderColor: '#000000',
          borderWidth: [1, 1, 1, 1],
          stack: [
            // Header with company branding
            {
              canvas: [
                {
                  type: 'rect',
                  x: 0,
                  y: 0,
                  w: 280,
                  h: 35,
                  color: '#ffffff'
                }
              ]
            },
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    {
                      text: 'WAREHOUSE',
                      style: 'companyHeader',
                      color: '#1a237e'
                    },
                    {
                      text: 'LABEL PART',
                      style: 'companySubHeader',
                      color: '#1a237e'
                    }
                  ]
                },
                {
                  width: 'auto',
                  qr: label.label_number,
                  fit: 50,
                  alignment: 'right',
                  margin: [0, 2, 0, 0]
                }
              ],
              margin: [6, -32, 6, 8]
            },
            // Label number prominent
            {
              text: label.label_number,
              style: 'labelNumber',
              alignment: 'center',
              margin: [6, 0, 6, 6]
            },
            // Main info table with better styling
            {
              table: {
                widths: ['40%', '*'],
                body: [
                  [
                    { text: 'Work Order Number', style: 'tableLabel', fillColor: '#e8eaf6' },
                    { text: workOrder.wo_number, style: 'tableValue' }
                  ],
                  [
                    { text: 'Part Number', style: 'tableLabel', fillColor: '#e8eaf6' },
                    { text: part.part_number, style: 'tableValueHighlight' }
                  ],
                  [
                    { text: 'Part Name', style: 'tableLabel', fillColor: '#e8eaf6' },
                    { text: part.part_name, style: 'tableValue' }
                  ],
                  [
                    { text: 'Supplier', style: 'tableLabel', fillColor: '#e8eaf6' },
                    { text: part.supplier?.name || '-', style: 'tableValue' }
                  ],
                  [
                    { text: 'Qty per Kanban', style: 'tableLabel', fillColor: '#e8eaf6' },
                    { text: part.package?.capacity || '-', style: 'tableValueHighlight' }
                  ]
                ]
              },
              layout: {
                hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
                vLineWidth: () => 0,
                hLineColor: () => '#c5cae9',
                paddingTop: () => 6,
                paddingBottom: () => 6,
                paddingLeft: () => 8,
                paddingRight: () => 8
              },
              margin: [6, 0, 6, 6]
            },
            // Footer
            {
              columns: [
                {
                  width: '*',
                  text: 'Printed: ' + printedAt,
                  style: 'footer',
                  alignment: 'left'
                },
                {
                  width: 'auto',
                  text: 'OSW v1.0',
                  style: 'footer',
                  alignment: 'right'
                }
              ],
              margin: [6, 2, 6, 6]
            }
          ]
        });
      }

      const tableBody = [];

      for (let i = 0; i < labelItems.length; i += 2) {
        tableBody.push([
          {
            margin: [6, 6, 6, 6],
            ...labelItems[i],
            height: 220,
            border: [true, true, true, true],
            borderColor: [
              '#000000',
              '#000000',
              '#000000',
              '#000000'
            ]
          },
          labelItems[i + 1]
            ? {
                margin: [6, 6, 6, 6],
                ...labelItems[i + 1],
                height: 220
              }
            : { text: '', height: 220 }
        ]);
      }

      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [12, 12, 12, 12],
        content: [
          {
            table: {
              widths: ['50%', '50%'],
              body: tableBody,
              dontBreakRows: true
            },
            layout: {
              hLineWidth: (i, node) => 1,
              vLineWidth: (i, node) => 1,
              hLineColor: () => '#000000',
              vLineColor: () => '#000000',
              paddingTop: () => 0,
              paddingBottom: () => 0,
              paddingLeft: () => 0,
              paddingRight: () => 0
            }
          }
        ],
        styles: {
          companyHeader: { fontSize: 16, bold: true, italics: true },
          companySubHeader: { fontSize: 10, bold: false },
          labelNumber: { fontSize: 11, bold: true, color: '#1a237e' },
          tableLabel: { fontSize: 9, bold: true, color: '#303f9f' },
          tableValue: { fontSize: 9, color: '#212121' },
          tableValueHighlight: { fontSize: 9, bold: true, color: '#1a237e' },
          footer: { fontSize: 7, color: '#9e9e9e' }
        },
        defaultStyle: {
          font: 'Roboto'
        }
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename=wo-label-${part.part_number}.pdf`
      );

      pdfDoc.pipe(res);
      pdfDoc.end();

      return;

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        status: false,
        message: 'Internal server error'
      });
    }
  }

  async getDropdownWorkOrderStoringType() {
    try {
      const types = await RefWorkOrderStoringType.findAll({
        attributes: ['id', 'name'],
        order: [['id', 'ASC']]
      });

      return {
        status: true,
        data: types
      };
    } catch (error) {
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async getDropdownWorkOrderStoringStatus() {
    try {
      const statuses = await RefWorkOrderStoringStatus.findAll({
        attributes: ['id', 'name'],
        order: [['id', 'ASC']]
      });

      return {
        status: true,
        data: statuses
      };
    } catch (error) {
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async getDropdownWoProduction() {
    try {
      const workOrders = await SWorkOrder.findAll({
        where: {
          status: {
            [Op.in]: ['Released', 'In_Progress']
          }
        },
        attributes: ['id', 'wo_number', 'planned_quantity'],
        include: [
          {
            model: SParts,
            as: 'part',
            attributes: ['id', 'part_number'],
            include: [
              {
                model: SUom,
                as: 'uom',
                attributes: ['id', 'name']
              }
            ]
          }
        ],
        order: [['work_date', 'ASC'], ['wo_number', 'ASC']]
      });

      const result = [];

      for (const wo of workOrders) {
        let hasRemainingSupply = false;

        const stations = await SWorkOrderStation.findAll({
          where: {
            wo_id: wo.id
          }
        });

        for (const station of stations) {
          const materials = await SWorkOrderMaterial.findAll({
            where: {
              wo_station_id: station.id
            },
            include: [
              {
                model: SParts,
                as: 'material_part',
                required: true,
                where: {
                  part_type_code: 'RAW'
                },
                attributes: ['id'],
                include: [
                  {
                    model: SPackages,
                    as: 'package',
                    attributes: ['capacity']
                  }
                ]
              }
            ]
          });

          for (const material of materials) {
            const packageCapacity = Number(material.material_part?.package?.capacity || 1);

            const suppliedKanban = await TWorkOrderStoringItem.sum(
              'total_kanban',
              {
                include: [
                  {
                    model: TWorkOrderStoring,
                    as: 'work_order',
                    attributes: [],
                    required: true,
                    where: {
                      production_wo_id: wo.id,
                      station_id: station.station_id,
                      take_out_purpose: 'production',
                      wo_status_id: {
                        [Op.in]: [2, 3, 4]
                      }
                    }
                  }
                ],
                where: {
                  part_id: material.material_part_id
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
                    attributes: [],
                    required: true,
                    where: {
                      production_wo_id: wo.id,
                      station_id: station.station_id,
                      take_out_purpose: 'production',
                      wo_status_id: {
                        [Op.in]: [2, 3, 4]
                      }
                    }
                  }
                ],
                where: {
                  part_id: material.material_part_id
                }
              }
            ) || 0;

            const suppliedQty = warehouseSuppliedQty + Number(bufferUsedQty);

            const remainingQty = Math.max(Number(material.planned_quantity) - suppliedQty, 0);

            if (remainingQty > 0) {
              hasRemainingSupply = true;
              break;
            }
          }

          if (hasRemainingSupply) {
            break;
          }
        }

        if (!hasRemainingSupply) {
          continue;
        }

        result.push({
          id: wo.id,
          wo_number: wo.wo_number,
          part_number: wo.part?.part_number,
          planned_quantity: wo.planned_quantity
        });
      }

      return {
        status: true,
        data: result
      };
    } catch (error) {
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async getDropdownStation(req) {
    try {
      const { take_out_purpose, production_wo_id } = req.query;

      if (!take_out_purpose) {
        return {
          status: false,
          message: 'Take Out Purpose is required',
          code: 400
        };
      }

      if (take_out_purpose === 'buffer' && production_wo_id) {
        return {
          status: false,
          message: 'Production Work Order is not allowed for Buffer purpose',
          code: 400
        };
      }

      if (take_out_purpose === 'production') {
        if (!production_wo_id) {
          return {
            status: false,
            message: 'Production Work Order is required',
            code: 400
          };
        }

        const wo = await SWorkOrder.findByPk(
          production_wo_id,
          {
            attributes: ['id']
          }
        );

        if (!wo) {
          return {
            status: false,
            message: 'Production Work Order not found',
            code: 404
          };
        }

        const woStations = await SWorkOrderStation.findAll({
          where: {
            wo_id: production_wo_id
          },
          include: [
            {
              model: SStations,
              as: 'station',
              attributes: ['id', 'station_code', 'name']
            }
          ]
        });

        const result = [];

        for (const woStation of woStations) {
          const materialsResult = [];

          const materials = await SWorkOrderMaterial.findAll({
            where: {
              wo_station_id: woStation.id
            },
            include: [
              {
                model: SParts,
                as: 'material_part',
                required: true,
                where: {
                  part_type_code: 'RAW'
                },
                attributes: ['id', 'part_number', 'part_name'],
                include: [
                  {
                    model: SPackages,
                    as: 'package',
                    attributes: ['capacity']
                  },
                  {
                    model: SUom,
                    as: 'uom',
                    attributes: ['id', 'code', 'name']
                  }
                ]
              }
            ]
          });

          for (const material of materials) {
            const packageCapacity = Number(material.material_part?.package?.capacity || 1);

            const suppliedKanban = await TWorkOrderStoringItem.sum(
              'total_kanban',
              {
                include: [
                  {
                    model: TWorkOrderStoring,
                    as: 'work_order',
                    attributes: [],
                    required: true,
                    where: {
                      production_wo_id,
                      station_id: woStation.station_id,
                      take_out_purpose: 'production',
                      wo_status_id: {
                        [Op.in]: [2, 3, 4]
                      }
                    }
                  }
                ],
                where: {
                  part_id: material.material_part_id
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
                    attributes: [],
                    required: true,
                    where: {
                      production_wo_id,
                      station_id: woStation.station_id,
                      take_out_purpose: 'production',
                      wo_status_id: {
                        [Op.in]: [2, 3, 4]
                      }
                    }
                  }
                ],
                where: {
                  part_id: material.material_part_id
                }
              }
            ) || 0;

            const suppliedQty = warehouseSuppliedQty + Number(bufferUsedQty);
            const requiredQty = Number(material.planned_quantity);
            const remainingQty = Math.max(requiredQty - suppliedQty, 0);

            if (remainingQty <= 0) {
              continue;
            }

            const bufferStock = await TStationBufferStock.findOne({
              where: {
                station_id: woStation.station_id,
                part_id: material.material_part_id
              }
            });

            const bufferQty = Number(bufferStock?.qty_pcs || 0);
            let maxKanban = Math.floor(remainingQty / packageCapacity);
            const remainder = remainingQty % packageCapacity;

            if (remainder > 0 && bufferQty < remainder) {
              maxKanban += 1;
            }

            if (remainingQty > 0 && maxKanban === 0) {
              maxKanban = 1;
            }

            const areas = await db.sequelize.query(`
              SELECT
                wa.id,
                wa.area_code,
                wa.name,
                COUNT(ws.id)::int AS available_stock
              FROM t_warehouse_stock ws
              JOIN s_warehouse_bins wb ON wb.id = ws.bin_id AND wb.deleted_at IS NULL
              JOIN s_warehouse_areas wa ON wa.id = wb.area_id AND wa.deleted_at IS NULL
              JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id AND wil.deleted_at IS NULL
              JOIN t_part_labels pl ON pl.id = wil.label_id AND pl.deleted_at IS NULL
              WHERE ws.deleted_at IS NULL AND pl.part_id = :part_id
              GROUP BY wa.id, wa.area_code, wa.name
              ORDER BY wa.name ASC
            `, {
              replacements: {
                part_id: material.material_part_id
              },
              type: QueryTypes.SELECT
            });

            materialsResult.push({
              part_id: material.material_part.id,
              part_number: material.material_part.part_number,
              part_name: material.material_part.part_name,

              uom: material.material_part.uom
                ? {
                    id: material.material_part.uom.id,
                    code: material.material_part.uom.code,
                    name: material.material_part.uom.name
                  }
                : null,

              qty_per_kanban: packageCapacity,

              required_qty: requiredQty,
              supplied_qty: suppliedQty,
              remaining_qty: remainingQty,

              buffer_stock: bufferQty,
              max_kanban: maxKanban,

              areas: areas.map(area => ({
                id: area.id,
                area_code: area.area_code,
                name: area.name,
                available_stock: Number(area.available_stock)
              }))
            });
          }

          if (!materialsResult.length) {
            continue;
          }

          result.push({
            id: woStation.station.id,
            station_code: woStation.station.station_code,
            name: woStation.station.name,

            materials: materialsResult
          });
        }

        return {
          status: true,
          data: result
        };
      }

      if (take_out_purpose === 'buffer') {
        const routingDetails = await SPartRoutingDetails.findAll({
          include: [
            {
              model: SPartRoutings,
              as: 'routing',
              required: true,
              where: {
                active: true,
                is_default: true
              }
            },
            {
              model: SStations,
              as: 'station',
              attributes: ['id', 'station_code', 'name']
            },
            {
              model: SPartRoutingDetailMaterials,
              as: 'materials',
              required: true,
              include: [
                {
                  model: SParts,
                  as: 'part',
                  required: true,
                  where: {
                    part_type_code: 'RAW'
                  },
                  attributes: ['id', 'part_number', 'part_name', 'standard_buffer_stock'],
                  include: [
                    {
                      model: SPackages,
                      as: 'package',
                      attributes: ['capacity']
                    },
                    {
                      model: SUom,
                      as: 'uom',
                      attributes: ['id', 'code', 'name']
                    }
                  ]
                }
              ]
            }
          ],
          order: [['station_id', 'ASC']]
        });
      
        const stationMap = new Map();
      
        for (const detail of routingDetails) {
          const stationId = detail.station_id;
      
          if (!stationMap.has(stationId)) {
            stationMap.set(stationId, {
              id: detail.station.id,
              station_code: detail.station.station_code,
              name: detail.station.name,
              materials: [],
              materialIds: new Set()
            });
          }
      
          const stationData = stationMap.get(stationId);
      
          // Iterate through materials di routing_detail ini
          for (const material of detail.materials) {
            const partId = material.part_id;
      
            // prevent duplicate material
            if (stationData.materialIds.has(partId)) {
              continue;
            }
      
            stationData.materialIds.add(partId);
      
            const packageCapacity = Number(material.part?.package?.capacity || 1);
            const minBuffer = Number(material.part?.standard_buffer_stock || 0);
      
            const bufferStock = await TStationBufferStock.findOne({
              where: {
                station_id: stationId,
                part_id: partId
              }
            });
      
            const bufferQty = Number(bufferStock?.qty_pcs || 0);
            const refillQty = Math.max(minBuffer - bufferQty, 0);
      
            const areas = await db.sequelize.query(`
              SELECT
                wa.id,
                wa.area_code,
                wa.name,
                COUNT(ws.id)::int AS available_stock
              FROM t_warehouse_stock ws
              JOIN s_warehouse_bins wb ON wb.id = ws.bin_id AND wb.deleted_at IS NULL
              JOIN s_warehouse_areas wa ON wa.id = wb.area_id AND wa.deleted_at IS NULL
              JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id AND wil.deleted_at IS NULL
              JOIN t_part_labels pl ON pl.id = wil.label_id AND pl.deleted_at IS NULL
              WHERE ws.deleted_at IS NULL AND pl.part_id = :part_id
              GROUP BY wa.id, wa.area_code, wa.name
              ORDER BY wa.name
            `, {
              replacements: { part_id: partId },
              type: QueryTypes.SELECT
            });
      
            stationData.materials.push({
              part_id: material.part.id,
              part_number: material.part.part_number,
              part_name: material.part.part_name,
              current_buffer_stock: bufferQty,
              min_buffer_stock: minBuffer,
              refill_qty: refillQty,
              qty_per_kanban: packageCapacity,
              uom: material.part.uom
                ? {
                    id: material.part.uom.id,
                    code: material.part.uom.code,
                    name: material.part.uom.name
                  }
                : null,
              areas: areas.map(area => ({
                id: area.id,
                area_code: area.area_code,
                name: area.name,
                available_stock: Number(area.available_stock)
              }))
            });
          }
        }
      
        return {
          status: true,
          data: Array.from(stationMap.values()).map(station => ({
            id: station.id,
            station_code: station.station_code,
            name: station.name,
            materials: station.materials
          }))
        };
      }

      return {
        status: false,
        message: 'Invalid Take Out Purpose',
        code: 400
      };
    } catch (error) {
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }
}

export default new WorkOrderStoringModule();