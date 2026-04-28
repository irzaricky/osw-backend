import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const {
  TWorkOrderStoring,
  TWorkOrderStoringItem,
  TWorkOrderStoringItemLabel,
  TPartLabels,
  SWarehouseBins,
  TWarehouseStock,
  TWarehouseStockLog,
  SParts
} = db;

class PlacementModule extends BaseModule {
async list(req) {
  try {
    const params = req.query;
    const { limit, page, offset } = helper.getPagination(params);

    const search = params.search || '';
    const warehouse_area_id = params.warehouse_area_id;
    const wo_status_id = params.wo_status_id;
    const wo_type_id = params.wo_type_id;
    const wo_date = params.wo_date;

    const where = {
      wo_category: 'Placement'
    };

    if (wo_status_id) {
      where.wo_status_id = wo_status_id;
    } else {
      where.wo_status_id = {
        [Op.in]: [2, 3]
      };
    }
    if (warehouse_area_id) {
      where.warehouse_area_id = warehouse_area_id;
    }

    if (wo_status_id) {
      where.wo_status_id = wo_status_id;
    }

    if (wo_type_id) {
      where.wo_type_id = wo_type_id;
    }

    if (wo_date) {
      where.wo_date = wo_date;
    }

    const { count, rows } = await TWorkOrderStoring.findAndCountAll({
      where,
      limit,
      offset,
      attributes: [
        'id',
        'wo_number',
        'wo_category',
        'wo_date',
        'wo_description'
      ],
      include: [
        {
          model: db.RefWorkOrderStoringType,
          as: 'type',
          attributes: ['id', 'name']
        },
        {
          model: db.RefWorkOrderStoringStatus,
          as: 'status',
          attributes: ['id', 'name']
        },
        {
          model: db.SWarehouseAreas,
          as: 'area',
          attributes: ['id', 'name']
        },
        {
          model: TWorkOrderStoringItem,
          as: 'items',
          attributes: ['id'],
          include: [
            {
              model: TWorkOrderStoringItemLabel,
              as: 'item_labels',
              attributes: ['id', 'is_scanned_in']
            }
          ]
        }
      ],
      distinct: true,
      order: [['id', 'DESC']]
    });

    const data = rows.map(wo => {
      let totalLabel = 0;
      let totalScanned = 0;

      wo.items.forEach(item => {
        totalLabel += item.item_labels.length;
        totalScanned += item.item_labels.filter(label => label.is_scanned_in).length;
      });

      return {
        wo_id: wo.id,
        wo_number: wo.wo_number,
        wo_category: wo.wo_category,
        wo_date: wo.wo_date,
        wo_description: wo.wo_description,
        type: wo.type,
        area: wo.area,
        status: wo.status,
        total_label: totalLabel,
        total_scanned: totalScanned,
        remaining: totalLabel - totalScanned,
        progress: totalLabel > 0 ? Math.round((totalScanned / totalLabel) * 100) : 0
      };
    });

    return {
      status: true,
      data: helper.getPaginationData(data, count, page, limit)
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
    const { wo_id } = req.params;

    const workOrder = await TWorkOrderStoring.findByPk(wo_id, {
      attributes: [
        'id',
        'wo_number',
        'wo_category',
        'wo_date',
        'wo_description',
        'wo_type_id',
        'warehouse_area_id',
        'wo_status_id'
      ],
      include: [
        {
          model: db.RefWorkOrderStoringType,
          as: 'type',
          attributes: ['id', 'name']
        },
        {
          model: db.RefWorkOrderStoringStatus,
          as: 'status',
          attributes: ['id', 'name']
        },
        {
          model: db.SWarehouseAreas,
          as: 'area',
          attributes: ['id', 'name']
        },
        {
          model: TWorkOrderStoringItem,
          as: 'items',
          attributes: ['id', 'part_id', 'total_kanban', 'is_scanned_in'],
          include: [
            {
              model: SParts,
              as: 'part',
              attributes: ['id', 'part_number', 'part_name', 'part_category']
            },
            {
              model: TWorkOrderStoringItemLabel,
              as: 'item_labels',
              attributes: ['id', 'is_scanned_in', 'is_scanned_out'],
              include: [
                {
                  model: TPartLabels,
                  as: 'label',
                  attributes: ['id', 'label_number']
                }
              ]
            }
          ]
        }
      ]
    });

    if (!workOrder) {
      return {
        status: false,
        message: 'Work Order not found',
        code: 404
      };
    }

    const items = workOrder.items.map(item => {
      const totalLabel = item.item_labels.length;
      const totalScanned = item.item_labels.filter(label => label.is_scanned_in).length;
      const remaining = totalLabel - totalScanned;

      return {
        wo_item_id: item.id,
        part_id: item.part_id,
        part_unique: item.part?.part_number,
        part_number: item.part?.part_number,
        part_name: item.part?.part_name,
        part_category: item.part?.part_category,
        total_kanban: item.total_kanban,
        total_label: totalLabel,
        total_scanned: totalScanned,
        remaining,
        progress: totalLabel > 0 ? Math.round((totalScanned / totalLabel) * 100) : 0,
        labels: item.item_labels.map(label => ({
          wo_item_label_id: label.id,
          label_number: label.label?.label_number,
          is_scanned_in: label.is_scanned_in,
          is_scanned_out: label.is_scanned_out
        }))
      };
    });

    const totalLabel = items.reduce((sum, item) => sum + item.total_label, 0);
    const totalScanned = items.reduce((sum, item) => sum + item.total_scanned, 0);

    return {
      status: true,
      data: {
        wo_id: workOrder.id,
        wo_number: workOrder.wo_number,
        wo_category: workOrder.wo_category,
        wo_date: workOrder.wo_date,
        wo_description: workOrder.wo_description,
        type: workOrder.type,
        area: workOrder.area,
        status: workOrder.status,
        total_label: totalLabel,
        total_scanned: totalScanned,
        remaining: totalLabel - totalScanned,
        progress: totalLabel > 0 ? Math.round((totalScanned / totalLabel) * 100) : 0,
        items
      }
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
  async validateLabel(req) {
    try {
      const { wo_id } = req.params;
      const data = req.body;

      const schema = Joi.object({
        label_number: Joi.string().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) return validation;

      const { label_number } = validation.value;

      const workOrder = await TWorkOrderStoring.findByPk(wo_id);

      if (!workOrder) {
        return {
          status: false,
          message: 'Work Order not found',
          code: 404
        };
      }

      if (workOrder.wo_category !== 'Placement') {
        return {
          status: false,
          message: 'This Work Order is not for Placement',
          code: 400
        };
      }

      if (![2, 3].includes(workOrder.wo_status_id)) {
        return {
          status: false,
          message: 'Only Submitted or In Progress Work Order can be processed',
          code: 400
        };
      }

      const label = await TPartLabels.findOne({
        where: { label_number }
      });

      if (!label) {
        return {
          status: false,
          message: 'Part label not found',
          code: 404
        };
      }

      const itemLabel = await TWorkOrderStoringItemLabel.findOne({
        where: { label_id: label.id },
        include: [
          {
            model: TWorkOrderStoringItem,
            as: 'work_order_item',
            where: { wo_id },
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['id', 'part_number', 'part_name', 'part_category']
              }
            ]
          }
        ]
      });

      if (!itemLabel) {
        return {
          status: false,
          message: 'Label is not registered in this Work Order',
          code: 400
        };
      }

      if (itemLabel.is_scanned_in) {
        return {
          status: false,
          message: 'Label already placed',
          code: 400
        };
      }

      const existingStock = await TWarehouseStock.findOne({
        where: {
          wo_item_label_id: itemLabel.id
        }
      });

      if (existingStock) {
        return {
          status: false,
          message: 'Label already exists in warehouse stock',
          code: 400
        };
      }

      return {
        status: true,
        message: 'Label valid',
        data: {
          wo_id: Number(wo_id),
          wo_item_label_id: itemLabel.id,
          label_number,
          part: itemLabel.work_order_item?.part
        }
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

  async getAvailableBins(req) {
    try {
      const { wo_id } = req.params;
      const params = req.query;

      const workOrder = await TWorkOrderStoring.findByPk(wo_id);

      if (!workOrder) {
        return {
          status: false,
          message: 'Work Order not found',
          code: 404
        };
      }

      const where = {
        area_id: workOrder.warehouse_area_id
      };

      if (params.search) {
        where.bin_code = {
          [Op.iLike]: `%${params.search}%`
        };
      }

      const bins = await SWarehouseBins.findAll({
        where,
        order: [['bin_code', 'ASC']]
      });

      const result = [];

      for (const bin of bins) {
        const usedCapacity = await TWarehouseStock.count({
          where: {
            bin_id: bin.id
          }
        });

        const capacity = bin.capacity || 0;
        const remainingCapacity = capacity > 0 ? capacity - usedCapacity : null;

        result.push({
          id: bin.id,
          bin_code: bin.bin_code,
          area_id: bin.area_id,
          capacity,
          used_capacity: usedCapacity,
          remaining_capacity: remainingCapacity,
          is_dedicated: bin.is_dedicated,
          dedicated_part_number: bin.dedicated_part_number,
          status: usedCapacity === 0 ? 'Empty' : remainingCapacity <= 0 ? 'Full' : 'Available'
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

  async placeBin(req) {
    const t = await db.sequelize.transaction();

    try {
      const { wo_id } = req.params;
      const data = req.body;

      const schema = Joi.object({
        label_number: Joi.string().required(),
        bin_code: Joi.string().required(),
        qty_per_kanban: Joi.number().min(1).default(1)
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { label_number, bin_code, qty_per_kanban } = validation.value;

      const workOrder = await TWorkOrderStoring.findByPk(wo_id, {
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

      if (workOrder.wo_category !== 'Placement') {
        await t.rollback();
        return {
          status: false,
          message: 'This Work Order is not for Placement',
          code: 400
        };
      }

      if (![2, 3].includes(workOrder.wo_status_id)) {
        await t.rollback();
        return {
          status: false,
          message: 'Only Submitted or In Progress Work Order can be processed',
          code: 400
        };
      }

      const label = await TPartLabels.findOne({
        where: { label_number },
        transaction: t
      });

      if (!label) {
        await t.rollback();
        return {
          status: false,
          message: 'Part label not found',
          code: 404
        };
      }

      const itemLabel = await TWorkOrderStoringItemLabel.findOne({
        where: { label_id: label.id },
        include: [
          {
            model: TWorkOrderStoringItem,
            as: 'work_order_item',
            where: { wo_id },
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['id', 'part_number', 'part_name', 'part_category']
              }
            ]
          }
        ],
        transaction: t
      });

      if (!itemLabel) {
        await t.rollback();
        return {
          status: false,
          message: 'Label is not registered in this Work Order',
          code: 400
        };
      }

      if (itemLabel.is_scanned_in) {
        await t.rollback();
        return {
          status: false,
          message: 'Label already placed',
          code: 400
        };
      }

      const existingStock = await TWarehouseStock.findOne({
        where: {
          wo_item_label_id: itemLabel.id
        },
        transaction: t
      });

      if (existingStock) {
        await t.rollback();
        return {
          status: false,
          message: 'Label already exists in warehouse stock',
          code: 400
        };
      }

      const bin = await SWarehouseBins.findOne({
        where: { bin_code },
        transaction: t
      });

      if (!bin) {
        await t.rollback();
        return {
          status: false,
          message: 'Warehouse bin not found',
          code: 404
        };
      }

      if (bin.area_id !== workOrder.warehouse_area_id) {
        await t.rollback();
        return {
          status: false,
          message: 'Bin does not belong to this Work Order warehouse area',
          code: 400
        };
      }

      const partNumber = itemLabel.work_order_item?.part?.part_number;

      if (bin.is_dedicated && bin.dedicated_part_number && bin.dedicated_part_number !== partNumber) {
        await t.rollback();
        return {
          status: false,
          message: 'This bin is dedicated for another part number',
          code: 400
        };
      }

      const usedCapacity = await TWarehouseStock.count({
        where: {
          bin_id: bin.id
        },
        transaction: t
      });

      if (bin.capacity && usedCapacity >= bin.capacity) {
        await t.rollback();
        return {
          status: false,
          message: 'Warehouse bin capacity is full',
          code: 400
        };
      }

      const stock = await TWarehouseStock.create({
        wo_item_label_id: itemLabel.id,
        bin_id: bin.id
      }, { transaction: t });

      await TWarehouseStockLog.create({
        wh_stock_id: stock.id,
        user_id: req.user?.id,
        is_placement: true,
        qty_per_kanban
      }, { transaction: t });

      await itemLabel.update({
        is_scanned_in: true
      }, { transaction: t });

      await itemLabel.work_order_item.update({
        is_scanned_in: true
      }, { transaction: t });

      if (workOrder.wo_status_id === 2) {
        await workOrder.update({
          wo_status_id: 3
        }, { transaction: t });
      }

      const totalLabels = await TWorkOrderStoringItemLabel.count({
        include: [
          {
            model: TWorkOrderStoringItem,
            as: 'work_order_item',
            where: { wo_id }
          }
        ],
        transaction: t
      });

      const totalScanned = await TWorkOrderStoringItemLabel.count({
        where: {
          is_scanned_in: true
        },
        include: [
          {
            model: TWorkOrderStoringItem,
            as: 'work_order_item',
            where: { wo_id }
          }
        ],
        transaction: t
      });

      if (totalLabels > 0 && totalLabels === totalScanned) {
        await workOrder.update({
          wo_status_id: 4
        }, { transaction: t });
      }

      await t.commit();

      return {
        status: true,
        message: 'Label successfully placed',
        data: {
          wo_id: workOrder.id,
          wo_number: workOrder.wo_number,
          label_number,
          bin_code,
          placement: 'IN',
          qty_per_kanban,
          total_label: totalLabels,
          total_scanned: totalScanned,
          remaining: totalLabels - totalScanned
        }
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
}

export default new PlacementModule();