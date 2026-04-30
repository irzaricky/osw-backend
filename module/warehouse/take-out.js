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
  TWarehouseStock,
  TWarehouseStockLog,
  SWarehouseBins,
  SParts,
  SPackages
} = db;

class TakeOutModule extends BaseModule {
  async ensureFifoLabelsAssigned(wo_id, transaction = null) {
    const workOrder = await TWorkOrderStoring.findByPk(wo_id, {
      include: [
        {
          model: TWorkOrderStoringItem,
          as: 'items',
          include: [
            {
              model: TWorkOrderStoringItemLabel,
              as: 'item_labels',
              attributes: ['id', 'label_id', 'is_scanned_out']
            }
          ]
        }
      ],
      transaction
    });

    if (!workOrder || workOrder.wo_category !== 'Take Out') return;

    for (const item of workOrder.items) {
      const existingLabelIds = item.item_labels.map(row => row.label_id);
      const needed = Number(item.total_kanban || 0) - existingLabelIds.length;

      if (needed <= 0) continue;

      const stocks = await TWarehouseStock.findAll({
        include: [
          {
            model: TWorkOrderStoringItemLabel,
            as: 'work_order_item_label',
            include: [
              {
                model: TPartLabels,
                as: 'label',
                attributes: ['id', 'label_number', 'part_id'],
                where: {
                  part_id: item.part_id
                }
              }
            ]
          },
          {
            model: TWarehouseStockLog,
            as: 'logs',
            attributes: ['id', 'is_placement', 'created_at'],
            required: false
          }
        ],
        transaction
      });

      const fifoStocks = stocks
        .map(stock => {
          const placementLog = stock.logs
            ?.filter(log => log.is_placement)
            ?.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))?.[0];

          return {
            label_id: stock.work_order_item_label?.label?.id,
            placement_at: placementLog?.created_at || stock.created_at
          };
        })
        .filter(row => row.label_id && !existingLabelIds.includes(row.label_id))
        .sort((a, b) => new Date(a.placement_at) - new Date(b.placement_at))
        .slice(0, needed);

      for (const fifo of fifoStocks) {
        await TWorkOrderStoringItemLabel.findOrCreate({
          where: {
            wo_item_id: item.id,
            label_id: fifo.label_id
          },
          defaults: {
            is_scanned_in: false,
            is_scanned_out: false
          },
          transaction
        });
      }
    }
  }

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
        wo_category: 'Take Out'
      };

      if (wo_status_id) {
        where.wo_status_id = wo_status_id;
      } else {
        where.wo_status_id = {
          [Op.in]: [2, 3]
        };
      }

      if (search) {
        where.wo_number = {
          [Op.iLike]: `%${search}%`
        };
      }

      if (warehouse_area_id) where.warehouse_area_id = warehouse_area_id;
      if (wo_type_id) where.wo_type_id = wo_type_id;
      if (wo_date) where.wo_date = wo_date;

      const { count, rows } = await TWorkOrderStoring.findAndCountAll({
        where,
        limit,
        offset,
        attributes: ['id', 'wo_number', 'wo_category', 'wo_date', 'wo_description'],
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
                attributes: ['id', 'is_scanned_out']
              }
            ]
          }
        ],
        distinct: true,
        order: [['id', 'DESC']]
      });

      const data = rows.map(wo => {
        let totalLabel = 0;
        let totalScannedOut = 0;

        wo.items.forEach(item => {
          totalLabel += item.item_labels.length;
          totalScannedOut += item.item_labels.filter(label => label.is_scanned_out).length;
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
          total_scanned_out: totalScannedOut,
          remaining: totalLabel - totalScannedOut,
          progress: totalLabel > 0 ? Math.round((totalScannedOut / totalLabel) * 100) : 0
        };
      });

      return {
        status: true,
        data: helper.getPaginationData(data, count, page, limit)
      };
    } catch (error) {
      return config.debug
        ? { status: false, error: error.message, code: 500 }
        : { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async detail(req) {
    try {
      const { wo_id } = req.params;

      await this.ensureFifoLabelsAssigned(wo_id);

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
            attributes: ['id', 'part_id', 'total_kanban', 'is_scanned_out'],
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['id', 'part_number', 'part_name', 'part_category', 'package_id']
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
        return { status: false, message: 'Work Order not found', code: 404 };
      }

      if (workOrder.wo_category !== 'Take Out') {
        return { status: false, message: 'This Work Order is not for Take Out', code: 400 };
      }

      const items = await Promise.all(workOrder.items.map(async item => {
        const totalLabel = item.item_labels.length;
        const totalScannedOut = item.item_labels.filter(label => label.is_scanned_out).length;
        const remaining = totalLabel - totalScannedOut;

        const packageData = item.part?.package_id
          ? await SPackages.findByPk(item.part.package_id, {
              attributes: ['id', 'package_code', 'name', 'capacity']
            })
          : null;

        const capacity = packageData?.capacity || 0;

        return {
          wo_item_id: item.id,
          part_id: item.part_id,
          part_number: item.part?.part_number,
          part_name: item.part?.part_name,
          part_category: item.part?.part_category,
          package_id: packageData?.id || item.part?.package_id || null,
          package_code: packageData?.package_code || null,
          package_name: packageData?.name || null,
          capacity_per_kanban: capacity,
          total_kanban: item.total_kanban,
          total_label: totalLabel,
          total_scanned_out: totalScannedOut,
          remaining,
          total_pcs: totalLabel * capacity,
          scanned_out_pcs: totalScannedOut * capacity,
          remaining_pcs: remaining * capacity,
          progress: totalLabel > 0 ? Math.round((totalScannedOut / totalLabel) * 100) : 0,
          labels: item.item_labels.map(label => ({
            wo_item_label_id: label.id,
            label_number: label.label?.label_number,
            is_scanned_in: label.is_scanned_in,
            is_scanned_out: label.is_scanned_out
          }))
        };
      }));

      const totalLabel = items.reduce((sum, item) => sum + item.total_label, 0);
      const totalScannedOut = items.reduce((sum, item) => sum + item.total_scanned_out, 0);
      const totalPcs = items.reduce((sum, item) => sum + item.total_pcs, 0);
      const scannedOutPcs = items.reduce((sum, item) => sum + item.scanned_out_pcs, 0);

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
          total_scanned_out: totalScannedOut,
          remaining: totalLabel - totalScannedOut,
          total_pcs: totalPcs,
          scanned_out_pcs: scannedOutPcs,
          remaining_pcs: totalPcs - scannedOutPcs,
          progress: totalLabel > 0 ? Math.round((totalScannedOut / totalLabel) * 100) : 0,
          items
        }
      };
    } catch (error) {
      return config.debug
        ? { status: false, error: error.message, code: 500 }
        : { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async recommendations(req) {
    try {
      const { wo_id } = req.params;

      await this.ensureFifoLabelsAssigned(wo_id);

      const workOrder = await TWorkOrderStoring.findByPk(wo_id, {
        include: [
          {
            model: TWorkOrderStoringItem,
            as: 'items',
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['id', 'part_number', 'part_name', 'part_category', 'package_id']
              }
            ]
          }
        ]
      });

      if (!workOrder) {
        return { status: false, message: 'Work Order not found', code: 404 };
      }

      if (workOrder.wo_category !== 'Take Out') {
        return { status: false, message: 'This Work Order is not for Take Out', code: 400 };
      }

      const result = [];

      for (const item of workOrder.items) {
        const part = item.part;

        const stocks = await TWarehouseStock.findAll({
          include: [
            {
              model: TWorkOrderStoringItemLabel,
              as: 'work_order_item_label',
              include: [
                {
                  model: TPartLabels,
                  as: 'label',
                  attributes: ['id', 'label_number', 'part_id'],
                  where: {
                    part_id: item.part_id
                  }
                }
              ]
            },
            {
              model: SWarehouseBins,
              as: 'bin',
              attributes: ['id', 'bin_code', 'area_id', 'capacity', 'is_dedicated', 'dedicated_part_number']
            },
            {
              model: TWarehouseStockLog,
              as: 'logs',
              attributes: ['id', 'is_placement', 'qty_per_kanban', 'created_at'],
              required: false
            }
          ]
        });

        const activeStocks = stocks
          .map(stock => {
            const placementLog = stock.logs
              ?.filter(log => log.is_placement)
              ?.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))?.[0];

            return {
              stock_id: stock.id,
              wo_item_label_id: stock.wo_item_label_id,
              label_number: stock.work_order_item_label?.label?.label_number,
              part_id: part.id,
              part_number: part.part_number,
              part_name: part.part_name,
              bin_id: stock.bin?.id,
              bin_code: stock.bin?.bin_code,
              placement_at: placementLog?.created_at || stock.created_at,
              qty_per_kanban: placementLog?.qty_per_kanban || 1
            };
          })
          .filter(stock => stock.label_number)
          .sort((a, b) => new Date(a.placement_at) - new Date(b.placement_at));

        const recommended = activeStocks[0] || null;
        const bins = [];

        for (const stock of activeStocks) {
          let bin = bins.find(row => row.bin_id === stock.bin_id);

          if (!bin) {
            const allStocksInBin = await TWarehouseStock.findAll({
              where: { bin_id: stock.bin_id },
              include: [
                {
                  model: TWorkOrderStoringItemLabel,
                  as: 'work_order_item_label',
                  include: [
                    {
                      model: TPartLabels,
                      as: 'label',
                      attributes: ['id', 'label_number', 'part_id'],
                      include: [
                        {
                          model: SParts,
                          as: 'part',
                          attributes: ['id', 'part_number', 'part_name']
                        }
                      ]
                    }
                  ]
                }
              ]
            });

            bin = {
              bin_id: stock.bin_id,
              bin_code: stock.bin_code,
              is_recommended_bin: recommended?.bin_id === stock.bin_id,
              stocks: allStocksInBin.map(row => ({
                stock_id: row.id,
                label_number: row.work_order_item_label?.label?.label_number,
                part_id: row.work_order_item_label?.label?.part_id,
                part_number: row.work_order_item_label?.label?.part?.part_number,
                part_name: row.work_order_item_label?.label?.part?.part_name,
                is_target_part: row.work_order_item_label?.label?.part_id === item.part_id
              }))
            };

            bins.push(bin);
          }
        }

        result.push({
          wo_item_id: item.id,
          part_id: item.part_id,
          part_number: part?.part_number,
          part_name: part?.part_name,
          total_kanban: item.total_kanban,
          recommended_label: recommended,
          bins
        });
      }

      return {
        status: true,
        data: result
      };
    } catch (error) {
      return config.debug
        ? { status: false, error: error.message, code: 500 }
        : { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async scanLabelOut(req) {
    const t = await db.sequelize.transaction();

    try {
      const { wo_id } = req.params;
      const data = req.body;

      const schema = Joi.object({
        label_number: Joi.string().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { label_number } = validation.value;

      await this.ensureFifoLabelsAssigned(wo_id, t);

      const workOrder = await TWorkOrderStoring.findByPk(wo_id, {
        transaction: t
      });

      if (!workOrder) {
        await t.rollback();
        return { status: false, message: 'Work Order not found', code: 404 };
      }

      if (workOrder.wo_category !== 'Take Out') {
        await t.rollback();
        return { status: false, message: 'This Work Order is not for Take Out', code: 400 };
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
        return { status: false, message: 'Part label not found', code: 404 };
      }

      const woItem = await TWorkOrderStoringItem.findOne({
        where: {
          wo_id,
          part_id: label.part_id
        },
        transaction: t
      });

      if (!woItem) {
        await t.rollback();
        return {
          status: false,
          message: 'Label part is not requested in this Work Order',
          code: 400
        };
      }

      const stock = await TWarehouseStock.findOne({
        include: [
          {
            model: TWorkOrderStoringItemLabel,
            as: 'work_order_item_label',
            where: { label_id: label.id }
          }
        ],
        transaction: t
      });

      if (!stock) {
        await t.rollback();
        return {
          status: false,
          message: 'Label is not currently available in warehouse stock',
          code: 400
        };
      }

      const fifoStock = await TWarehouseStock.findOne({
        include: [
          {
            model: TWorkOrderStoringItemLabel,
            as: 'work_order_item_label',
            include: [
              {
                model: TPartLabels,
                as: 'label',
                attributes: ['id', 'label_number', 'part_id'],
                where: {
                  part_id: label.part_id
                }
              }
            ]
          },
          {
            model: TWarehouseStockLog,
            as: 'logs',
            where: {
              is_placement: true
            },
            required: false
          }
        ],
        order: [
          [{ model: TWarehouseStockLog, as: 'logs' }, 'created_at', 'ASC'],
          ['id', 'ASC']
        ],
        transaction: t
      });

      if (fifoStock && fifoStock.id !== stock.id) {
        const recommendedLabel = fifoStock.work_order_item_label?.label?.label_number;

        await t.rollback();
        return {
          status: false,
          message: 'FIFO violation. Please take out the recommended label first.',
          code: 400,
          data: {
            scanned_label: label_number,
            recommended_stock_id: fifoStock.id,
            recommended_label: recommendedLabel
          }
        };
      }

      const takeOutItemLabel = await TWorkOrderStoringItemLabel.findOne({
        where: {
          wo_item_id: woItem.id,
          label_id: label.id
        },
        transaction: t
      });

      if (!takeOutItemLabel) {
        await t.rollback();
        return {
          status: false,
          message: 'Label is not registered in this Take Out Work Order',
          code: 400
        };
      }

      if (takeOutItemLabel.is_scanned_out) {
        await t.rollback();
        return {
          status: false,
          message: 'Label already taken out',
          code: 400
        };
      }

      await takeOutItemLabel.update({
        is_scanned_out: true
      }, { transaction: t });

      await TWarehouseStockLog.create({
        wh_stock_id: stock.id,
        user_id: req.user?.id,
        is_placement: false,
        qty_per_kanban: 1
      }, { transaction: t });

      await TWarehouseStock.destroy({
        where: {
          id: stock.id
        },
        transaction: t
      });

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

      const totalScannedOut = await TWorkOrderStoringItemLabel.count({
        where: {
          is_scanned_out: true
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

      if (totalLabels > 0 && totalLabels === totalScannedOut) {
        await workOrder.update({
          wo_status_id: 4
        }, { transaction: t });
      }

      await t.commit();

      return {
        status: true,
        message: 'Label successfully taken out',
        data: {
          wo_id: workOrder.id,
          wo_number: workOrder.wo_number,
          label_number,
          placement: 'OUT',
          wo_item_label_id: takeOutItemLabel.id,
          total_label: totalLabels,
          total_scanned_out: totalScannedOut,
          remaining: totalLabels - totalScannedOut
        }
      };
    } catch (error) {
      await t.rollback();

      return config.debug
        ? { status: false, error: error.message, code: 500 }
        : { status: false, message: 'Internal server error', code: 500 };
    }
  }
}

export default new TakeOutModule();