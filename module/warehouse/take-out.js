import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op, QueryTypes } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const {
  TWorkOrderStoring,
  TWorkOrderStoringItem,
  TWorkOrderStoringItemLabel,
  TPartLabels,
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
          attributes: ['id', 'wo_id', 'part_id', 'total_kanban'],
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
      const targetKanban = Number(item.total_kanban || 0);
      if (targetKanban <= 0) continue;

      const existingLabelIds = item.item_labels.map(row => row.label_id);
      const needed = targetKanban - existingLabelIds.length;

      if (needed <= 0) continue;

      const replacements = {
        part_id: item.part_id,
        limit: needed
      };

      if (existingLabelIds.length) {
        replacements.existing_label_ids = existingLabelIds;
      }

      const fifoStocks = await db.sequelize.query(`
        SELECT
          ws.id AS stock_id,
          pl.id AS label_id,
          pl.label_number,
          COALESCE(MIN(wsl.created_at), ws.created_at) AS placement_at
        FROM t_warehouse_stock ws
        JOIN t_work_order_storing_item_label source_wil
          ON source_wil.id = ws.wo_item_label_id
        JOIN t_part_labels pl
          ON pl.id = source_wil.label_id
        LEFT JOIN t_warehouse_stock_log wsl
          ON wsl.wh_stock_id = ws.id
          AND wsl.is_placement = true
        WHERE pl.part_id = :part_id
        ${existingLabelIds.length ? 'AND pl.id NOT IN (:existing_label_ids)' : ''}
        GROUP BY ws.id, pl.id, pl.label_number, ws.created_at
        ORDER BY placement_at ASC, ws.id ASC
        LIMIT :limit
      `, {
        replacements,
        type: QueryTypes.SELECT,
        transaction
      });

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
      const wo_date_start = params.wo_date_start;
      const wo_date_end = params.wo_date_end;

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

      if (wo_date_start && wo_date_end) {
        where[Op.and] = [
          ...(where[Op.and] || []),
          db.sequelize.where(
            db.sequelize.fn('DATE', db.sequelize.col('TWorkOrderStoring.wo_date')),
            {
              [Op.between]: [wo_date_start, wo_date_end]
            }
          )
        ];
      } else if (wo_date_start) {
        where[Op.and] = [
          ...(where[Op.and] || []),
          db.sequelize.where(
            db.sequelize.fn('DATE', db.sequelize.col('TWorkOrderStoring.wo_date')),
            {
              [Op.gte]: wo_date_start
            }
          )
        ];
      } else if (wo_date_end) {
        where[Op.and] = [
          ...(where[Op.and] || []),
          db.sequelize.where(
            db.sequelize.fn('DATE', db.sequelize.col('TWorkOrderStoring.wo_date')),
            {
              [Op.lte]: wo_date_end
            }
          )
        ];
      }

      const { count, rows } = await TWorkOrderStoring.findAndCountAll({
        where,
        limit,
        offset,
        attributes: ['id'],
        distinct: true,
        order: [['id', 'DESC']]
      });

      for (const wo of rows) {
        await this.ensureFifoLabelsAssigned(wo.id);
      }

      const refreshedRows = await TWorkOrderStoring.findAll({
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
            attributes: ['id', 'total_kanban'],
            include: [
              {
                model: TWorkOrderStoringItemLabel,
                as: 'item_labels',
                attributes: ['id', 'is_scanned_out']
              }
            ]
          }
        ],
        order: [['id', 'DESC']]
      });

      const data = refreshedRows.map(wo => {
        let totalLabel = 0;
        let totalScannedOut = 0;

        wo.items.forEach(item => {
          totalLabel += Number(item.total_kanban || 0);
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
      console.error('Take Out List Error:', error)

      return {
        status: false,
        error: error.message,
        detail: error.errors || error.parent?.detail || error.parent?.message,
        code: 500
      };
    }  }

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
        const totalLabel = Number(item.total_kanban || 0);
        const totalScannedOut = item.item_labels.filter(label => label.is_scanned_out).length;
        const remaining = Math.max(totalLabel - totalScannedOut, 0);

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
      return {
        status: false,
        message: 'Work Order not found',
        code: 404
      };
    }

    const result = [];

    for (const item of workOrder.items) {
      const stocks = await db.sequelize.query(`
        SELECT
          ws.id AS stock_id,
          target_wil.id AS wo_item_label_id,
          pl.id AS label_id,
          pl.label_number,
          p.id AS part_id,
          p.part_number,
          p.part_name,
          b.id AS bin_id,
          b.bin_code,
          COALESCE(MIN(wsl.created_at), ws.created_at) AS placement_at,
          COALESCE(pkg.capacity, 1) AS qty_per_kanban
        FROM t_work_order_storing_item_label target_wil
        JOIN t_part_labels pl
          ON pl.id = target_wil.label_id
        JOIN s_parts p
          ON p.id = pl.part_id
        JOIN t_warehouse_stock ws
          ON ws.wo_item_label_id IN (
            SELECT source_wil.id
            FROM t_work_order_storing_item_label source_wil
            WHERE source_wil.label_id = target_wil.label_id
          )
        LEFT JOIN s_packages pkg
          ON pkg.id = p.package_id
        LEFT JOIN s_warehouse_bins b
          ON b.id = ws.bin_id
        LEFT JOIN t_warehouse_stock_log wsl
          ON wsl.wh_stock_id = ws.id
          AND wsl.is_placement = true
        WHERE target_wil.wo_item_id = :wo_item_id
          AND target_wil.is_scanned_out = false
        GROUP BY
          ws.id,
          target_wil.id,
          pl.id,
          pl.label_number,
          p.id,
          p.part_number,
          p.part_name,
          b.id,
          b.bin_code,
          pkg.capacity,
          ws.created_at
        ORDER BY placement_at ASC, ws.id ASC
      `, {
        replacements: {
          wo_item_id: item.id
        },
        type: QueryTypes.SELECT
      });

      const recommended = stocks[0] || null;

      const bins = stocks.reduce((acc, stock) => {
        let bin = acc.find(row => row.bin_id === stock.bin_id);

        if (!bin) {
          bin = {
            bin_id: stock.bin_id,
            bin_code: stock.bin_code,
            is_recommended_bin: recommended?.bin_id === stock.bin_id,
            stocks: []
          };

          acc.push(bin);
        }

        bin.stocks.push({
          stock_id: stock.stock_id,
          label_number: stock.label_number,
          part_id: stock.part_id,
          part_number: stock.part_number,
          part_name: stock.part_name,
          placement_at: stock.placement_at,
          qty_per_kanban: Number(stock.qty_per_kanban || 1),
          is_target_part: true
        });

        return acc;
      }, []);

      result.push({
        wo_item_id: item.id,
        part_id: item.part_id,
        part_number: item.part?.part_number,
        part_name: item.part?.part_name,
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
      label_number: Joi.string().required(),
      fifo_override: Joi.boolean().default(false)
    });

    const validation = helper.validate(data, schema);
    if (!validation.status) {
      await t.rollback();
      return validation;
    }

    const { label_number, fifo_override } = validation.value;

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
        message: 'Part is not requested in this Work Order',
        code: 400
      };
    }

    let takeOutItemLabel = await TWorkOrderStoringItemLabel.findOne({
      where: {
        wo_item_id: woItem.id,
        label_id: label.id
      },
      transaction: t
    });

    if (!takeOutItemLabel) {
      takeOutItemLabel = await TWorkOrderStoringItemLabel.create({
        wo_item_id: woItem.id,
        label_id: label.id,
        is_scanned_in: true,
        is_scanned_out: false
      }, {
        transaction: t
      });
    }

    if (takeOutItemLabel.is_scanned_out) {
      await t.rollback();
      return {
        status: false,
        message: 'Label already taken out',
        code: 400
      };
    }

    const stockRows = await db.sequelize.query(`
      SELECT
        ws.id AS stock_id,
        ws.wo_item_label_id,
        ws.bin_id,
        b.bin_code
      FROM t_warehouse_stock ws
      JOIN t_work_order_storing_item_label source_wil
        ON source_wil.id = ws.wo_item_label_id
      LEFT JOIN s_warehouse_bins b
        ON b.id = ws.bin_id
      WHERE source_wil.label_id = :label_id
      ORDER BY ws.id ASC
      LIMIT 1
      FOR UPDATE OF ws
    `, {
      replacements: {
        label_id: label.id
      },
      type: QueryTypes.SELECT,
      transaction: t
    });

    const activeStock = stockRows[0];

    if (!activeStock) {
      await t.rollback();
      return {
        status: false,
        message: 'Label is not available in warehouse stock',
        code: 400
      };
    }
    const recommendedRows = await db.sequelize.query(`
      SELECT
        pl.id AS label_id,
        pl.label_number,
        COALESCE(MIN(wsl.created_at), ws.created_at) AS placement_at
      FROM t_warehouse_stock ws
      JOIN t_work_order_storing_item_label source_wil
        ON source_wil.id = ws.wo_item_label_id
      JOIN t_part_labels pl
        ON pl.id = source_wil.label_id
      LEFT JOIN t_warehouse_stock_log wsl
        ON wsl.wh_stock_id = ws.id
        AND wsl.is_placement = true
      WHERE pl.part_id = :part_id
      GROUP BY ws.id, pl.id, pl.label_number, ws.created_at
      ORDER BY placement_at ASC, ws.id ASC
      LIMIT 1
    `, {
      replacements: {
        part_id: label.part_id
      },
      type: QueryTypes.SELECT,
      transaction: t
    });

    const recommended = recommendedRows[0] || null;

    const recommendedLabelId = recommended?.label_id || label.id;
    const recommendedLabelNumber = recommended?.label_number || label.label_number;
    const isFifoViolation =
      Number(label.id) !== Number(recommendedLabelId);

    await db.sequelize.query(`
      INSERT INTO t_warehouse_stock_log (
        wh_stock_id,
        wo_id,
        wo_item_label_id,
        label_id,
        part_id,
        bin_id,
        user_id,
        recommended_label_id,
        recommended_label_number,
        is_placement,
        fifo_override,
        qty_per_kanban,
        created_at,
        updated_at
      )
      VALUES (
        :wh_stock_id,
        :wo_id,
        :wo_item_label_id,
        :label_id,
        :part_id,
        :bin_id,
        :user_id,
        :recommended_label_id,
        :recommended_label_number,
        false,
        :fifo_override,
        1,
        NOW(),
        NOW()
      )
    `, {
      replacements: {
        wh_stock_id: activeStock.stock_id,
        wo_id: workOrder.id,
        wo_item_label_id: takeOutItemLabel.id,
        label_id: label.id,
        part_id: label.part_id,
        bin_id: activeStock.bin_id,
        user_id: req.user?.id || null,
        recommended_label_id: recommendedLabelId,
        recommended_label_number: recommendedLabelNumber,
        fifo_override: Boolean(fifo_override || isFifoViolation)
      },
      type: QueryTypes.INSERT,
      transaction: t
    });

    await takeOutItemLabel.update({
      is_scanned_out: true
    }, {
      transaction: t
    });

    await db.sequelize.query(`
      DELETE FROM t_warehouse_stock
      WHERE id = :stock_id
    `, {
      replacements: {
        stock_id: activeStock.stock_id
      },
      type: QueryTypes.DELETE,
      transaction: t
    });

    if (workOrder.wo_status_id === 2) {
      await workOrder.update({
        wo_status_id: 3
      }, {
        transaction: t
      });
    }

    const totalTargetKanban = await TWorkOrderStoringItem.sum(
  'total_kanban',
  {
    where: { wo_id },
    transaction: t
  }
);

    const totalScannedOut = await TWorkOrderStoringItemLabel.count({
      where: {
        is_scanned_out: true
      },
      include: [{
        model: TWorkOrderStoringItem,
        as: 'work_order_item',
        where: { wo_id }
      }],
      transaction: t
    });

    if (
      Number(totalScannedOut) >= Number(totalTargetKanban)
    ) {
      await workOrder.update({
        wo_status_id: 4
      }, {
        transaction: t
      });
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
        stock_id: activeStock.stock_id,
        bin_id: activeStock.bin_id,
        bin_code: activeStock.bin_code,
        wo_item_label_id: takeOutItemLabel.id,
        total_label: totalTargetKanban,
        total_scanned_out: totalScannedOut,
        remaining: Math.max(
          Number(totalTargetKanban) - Number(totalScannedOut),
          0
        )
      }
    };
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }

    return config.debug
      ? { status: false, error: error.message, code: 500 }
      : { status: false, message: 'Internal server error', code: 500 };
  }
}
}

export default new TakeOutModule();