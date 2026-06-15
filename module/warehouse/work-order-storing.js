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
  SParts,
  SPartRoutings,
  SPartRoutingDetails,
  SStations,
  RefStationTypes,
  SPackages,
  SWarehouseAreas,
  SSuppliers,
  SBoms,
  SBomDetails,
  SWorkOrder,
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
  TMaterialDeliveryOrderDetail
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

  async validateFirstAssemblyBufferStation(stationId, transaction) {
    const station = await SStations.findByPk(
      stationId,
      {
        include: [
          {
            model: RefStationTypes,
            as: 'station_type',
            attributes: ['id', 'name']
          }
        ],
        transaction
      }
    );

    if (!station) {
      throw new Error('Station not found');
    }

    if (station.station_type?.name !== 'ASSEMBLY') {
      throw new Error(
        'Station must be Assembly type'
      );
    }

    const routings = await SPartRoutings.findAll({
      attributes: ['id'],
      include: [
        {
          model: SPartRoutingDetails,
          as: 'routing_details',
          required: true,
          attributes: ['id', 'station_id', 'sequence'],
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
      ],
      transaction
    });

    const validStationIds = new Set();

    for (const routing of routings) {
      const firstAssembly = routing.routing_details
        .sort(
          (a, b) => a.sequence - b.sequence
        )[0];

      if (firstAssembly) {
        validStationIds.add(
          firstAssembly.station_id
        );
      }
    }

    if (!validStationIds.has(stationId)) {
      throw new Error(
        'Station must be a first assembly station'
      );
    }
    return true;
  }

  async validateBufferItems(stationId, items, transaction) {
    const routings = await SPartRoutings.findAll({
      attributes: ['id', 'part_id'],
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
      ],
      transaction
    });

    const validParentPartIds = [];

    for (const routing of routings) {
      const firstAssembly = routing.routing_details
        .sort(
          (a, b) => a.sequence - b.sequence
        )[0];

      if (firstAssembly && firstAssembly.station_id === stationId) {
        validParentPartIds.push(
          routing.part_id
        );
      }
    }

    if (!validParentPartIds.length) {
      throw new Error(
        'No part routing found for this station'
      );
    }

    const boms = await SBoms.findAll({
      where: {
        parent_part_id: {
          [Op.in]: validParentPartIds
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
      ],
      transaction
    });

    const allowedPartIds = new Set();

    for (const bom of boms) {
      for (const detail of bom.details) {
        allowedPartIds.add(
          detail.part_id
        );
      }
    }

    for (const item of items) {
      if (!allowedPartIds.has(item.part_id)) {
        throw new Error(
          `Part ${item.part_id} is not allowed for selected buffer station`
        );
      }
    }

    return true;
  }

  async getFirstAssemblyStation(productionWoId, transaction) {
    const wo = await SWorkOrder.findByPk(
      productionWoId,
      {
        attributes: ['part_id'],
        transaction
      }
    );

    if (!wo) {
      throw new Error('Production Work Order not found');
    }

    const routing = await SPartRoutings.findOne({
      where: {
        part_id: wo.part_id,
        active: true
      },
      include: [
        {
          model: SPartRoutingDetails,
          as: 'routing_details',
          required: true,
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
      ],
      transaction
    });

    if (!routing) {
      throw new Error('Part Routing not found');
    }

    const firstAssembly = routing.routing_details.sort((a, b) => a.sequence - b.sequence)[0];

    if (!firstAssembly) {
      throw new Error('Assembly station not found');
    }

    return firstAssembly.station_id;
  }

  async validateProductionTakeOut({production_wo_id, items, transaction}) {
    const wo = await SWorkOrder.findByPk(
      production_wo_id,
      {
        attributes: ['id', 'part_id', 'planned_quantity'],
        transaction
      }
    );

    if (!wo) {
      throw new Error('Production Work Order not found');
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
          required: false
        }
      ],
      transaction
    });

    if (!bom) {
      throw new Error('Active BOM not found');
    }

    const rawMaterials = bom.details.filter(
      d => d.type === 'RAW'
    );

    if (rawMaterials.length === 0) {
      throw new Error('Production WO has no raw material requirement');
    }

    const requiredMap = new Map();

    for (const detail of rawMaterials) {
      const requiredQty = Number(detail.qty_required) * Number(wo.planned_quantity);

      requiredMap.set(
        detail.part_id, requiredQty
      );
    }

    const partIds = items.map(i => i.part_id);

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

    const partMap = new Map(
      parts.map(part => [part.id, part])
    );

    // VALIDATE PART EXIST
    for (const item of items) {
      if (!requiredMap.has(item.part_id)) {
        throw new Error(
          `Part ${item.part_id} is not required by Production WO`
        );
      }
    }

    // VALIDATE SUPPLIED QTY
    for (const item of items) {
      const requiredQty = requiredMap.get(item.part_id);
      const part = partMap.get(item.part_id);

      if (!part) {
        throw new Error(
          `Part ${item.part_id} not found`
        );
      }

      const capacity = Number(part.package?.capacity || 1);

      const suppliedKanban = await TWorkOrderStoringItem.sum(
        'total_kanban',
        {
          include: [
            {
              model: TWorkOrderStoring,
              as: 'work_order',
              required: true,
              where: {
                production_wo_id,
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

      const suppliedQty = suppliedKanban * capacity;

      const requestedQty = item.total_kanban * capacity;

      const remainingQty = requiredQty - suppliedQty;

      if (remainingQty <= 0) {
        throw new Error(
          `Part ${item.part_id} already fully supplied`
        );
      }

      if (requestedQty > remainingQty) {
        throw new Error(
          `Part ${item.part_id} exceeds remaining requirement. Remaining: ${remainingQty}`
        );
      }
    }
    return true;
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
            await this.validateBufferItems(value.station_id, value.items, t);
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

          try {
            await helper.checkExists(SWorkOrder, value.production_wo_id, 'Production Work Order', t);
            await this.validateProductionTakeOut(value.production_wo_id, value.items, t);
            value.station_id = await this.getFirstAssemblyStation(value.production_wo_id, t);
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

      const items = value.items.map(item => ({
        wo_id: workOrder.id,
        part_id: item.part_id,
        total_kanban: item.total_kanban
      }));

      const createdItems = await TWorkOrderStoringItem.bulkCreate(items, {
        transaction: t,
        returning: true
      });

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

          const countLabel = await TPartLabels.count({
            where: {
              label_number: { [Op.like]: `${labelPrefix}%` }
            },
            transaction: t
          });

          for (let i = 1; i <= item.total_kanban; i++) {
            const labelNumber = `${labelPrefix}${String(countLabel + i).padStart(6, '0')}`;

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

      for (const newItem of value.items) {
        const existing = existingMap.get(newItem.part_id);

        if (existing) {
          await existing.update({
            total_kanban: newItem.total_kanban
          }, { transaction: t });

          updatedItems.push(existing);

        } else {
          const created = await TWorkOrderStoringItem.create({
            wo_id: id,
            part_id: newItem.part_id,
            total_kanban: newItem.total_kanban
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

          const prefix = `WO-${part.part_number}-${dateStr}-`;

          const lastLabel = await TPartLabels.findOne({
            where: {
              label_number: { [Op.like]: `${prefix}%` }
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
            const labelNumber = `${prefix}${String(nextNumber + i).padStart(6, '0')}`;

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
        include: [
          {
            model: SParts,
            as: 'part',
            attributes: ['id', 'part_number', 'part_name']
          }
        ],
        order: [['work_date', 'ASC'], ['wo_number', 'ASC']]
      });

      const result = [];

      for (const wo of workOrders) {
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
              include: [
                {
                  model: SParts,
                  as: 'part',
                  attributes: ['id', 'part_number', 'part_name'],
                  include: [
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
        });

        if (!bom) {
          continue;
        }

        const rawMaterials = bom.details.filter(
          d => d.type === 'RAW'
        );

        let firstAssemblyStation = null;

        const routing = await SPartRoutings.findOne({
          where: { 
            part_id: wo.part_id,
            active: true
          },
          include: [
            {
              model: SPartRoutingDetails,
              as: 'routing_details',
              include: [
                {
                  model: SStations,
                  as: 'station',
                  include: [
                    {
                      model: RefStationTypes,
                      as: 'station_type'
                    }
                  ]
                }
              ]
            }
          ]
        })

        if (routing?.routing_details?.length) {
          const sorted = [...routing.routing_details]
            .sort((a, b) => a.sequence - b.sequence);

          firstAssemblyStation =
            sorted.find(
              r => r.station?.station_type?.name?.toLowerCase().includes('assembly')
            )?.station;

          if (!firstAssemblyStation) {
            firstAssemblyStation = sorted[0]?.station ?? null;
          }
        }

        const materials = [];

        for (const detail of rawMaterials) {
          const requiredQty = Number(detail.qty_required) * wo.planned_quantity;

          const packageCapacity = Number(detail.part.package?.capacity || 1);

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

          const suppliedQty = suppliedKanban * packageCapacity;

          const remainingQty = Math.max(requiredQty - suppliedQty, 0);

          if (remainingQty <= 0) {
            continue;
          }

          materials.push({
            part_id: detail.part.id,
            part_number: detail.part.part_number,
            part_name: detail.part.part_name,
            required_qty: requiredQty,
            supplied_qty: suppliedQty,
            remaining_qty: remainingQty
          });
        }

        if (!materials.length) {
          continue;
        }

        result.push({
          wo_id: wo.id,
          wo_number: wo.wo_number,
          planned_quantity: wo.planned_quantity,
          part_id: wo.part.id,
          part_number: wo.part.part_number,
          part_name: wo.part.part_name,

          station: firstAssemblyStation
            ? {
                id: firstAssemblyStation.id,
                name: firstAssemblyStation.name
              }
            : null,

          materials
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
}

export default new WorkOrderStoringModule();