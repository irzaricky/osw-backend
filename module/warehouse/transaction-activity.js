import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import { Op, QueryTypes } from 'sequelize';

const {
  TWarehouseStockLog,
  TWarehouseStock,
  TWorkOrderStoringItemLabel,
  TWorkOrderStoringItem,
  TWorkOrderStoring,
  TPartLabels,
  SParts,
  SWarehouseBins,
  SWarehouseAreas,
  SUsers
} = db;

class TransactionActivityModule extends BaseModule {
  mapLog(log) {
    const stock = log.warehouse_stock;
    const itemLabel = stock?.work_order_item_label;
    const label = itemLabel?.label;
    const part = label?.part;
    const workOrderItem = itemLabel?.work_order_item;
    const workOrder = workOrderItem?.work_order;
    const bin = stock?.bin;

    const activityType = log.is_placement ? 'IN' : 'OUT';

    return {
      id: log.id,
      activity_type: activityType,

      wo_id: workOrder?.id || null,
      wo_number: workOrder?.wo_number || null,
      wo_date: workOrder?.wo_date || null,
      wo_type: workOrder?.type?.name || null,
      wo_category: workOrder?.wo_category || null,

      part_id: part?.id || null,
      part_number: part?.part_number || null,
      part_name: part?.part_name || null,
      part_category: part?.part_category || null,

      label_id: label?.id || null,
      label_number: label?.label_number || null,

      kanban: 1,
      qty_per_kanban: log.qty_per_kanban || 1,

      warehouse_area_id: workOrder?.area?.id || null,
      warehouse_area: workOrder?.area?.name || null,

      storage_bin_origin: activityType === 'OUT' ? bin?.bin_code || null : null,
      storage_bin_destination: activityType === 'IN' ? bin?.bin_code || null : null,

      bin_id: bin?.id || null,
      bin_code: bin?.bin_code || null,

      timestamp_activity: log.created_at,

      user_id: log.user_id || null,
      user: log.user?.email || null,

      qr_part: label?.label_number || null,
      qr_bin: bin?.bin_code || null
    };
  }

  async list(req) {
  try {
    const params = req.query;
    const { limit, page, offset } = helper.getPagination(params);

    const {
      search,
      activity_type,
      wo_category,
      wo_type_id,
      warehouse_area_id,
      bin_id,
      part_number,
      label_number,
      user_id,
      date_from,
      date_to
    } = params;

    const replacements = {
      limit,
      offset
    };

    const where = [];

    if (activity_type === 'IN') {
      where.push(`wsl.is_placement = true`);
    }

    if (activity_type === 'OUT') {
      where.push(`wsl.is_placement = false`);
    }

    if (user_id) {
      where.push(`wsl.user_id = :user_id`);
      replacements.user_id = user_id;
    }

    if (wo_category) {
      where.push(`wo.wo_category = :wo_category`);
      replacements.wo_category = wo_category;
    }

    if (wo_type_id) {
      where.push(`wo.wo_type_id = :wo_type_id`);
      replacements.wo_type_id = wo_type_id;
    }

    if (warehouse_area_id) {
      where.push(`wa.id = :warehouse_area_id`);
      replacements.warehouse_area_id = warehouse_area_id;
    }

    if (bin_id) {
      where.push(`bin.id = :bin_id`);
      replacements.bin_id = bin_id;
    }

    if (part_number) {
      where.push(`part.part_number ILIKE :part_number`);
      replacements.part_number = `%${part_number}%`;
    }

    if (label_number) {
      where.push(`label.label_number ILIKE :label_number`);
      replacements.label_number = `%${label_number}%`;
    }

    if (date_from) {
      where.push(`wsl.created_at >= :date_from`);
      replacements.date_from = date_from;
    }

    if (date_to) {
      where.push(`wsl.created_at <= :date_to`);
      replacements.date_to = `${date_to} 23:59:59`;
    }

    if (search) {
      where.push(`(
        wo.wo_number ILIKE :search OR
        part.part_number ILIKE :search OR
        part.part_name ILIKE :search OR
        label.label_number ILIKE :search OR
        bin.bin_code ILIKE :search OR
        wa.name ILIKE :search OR
        usr.email ILIKE :search
      )`);
      replacements.search = `%${search}%`;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await db.sequelize.query(`
      SELECT
        wsl.id,
        CASE 
          WHEN wsl.is_placement = true THEN 'IN'
          ELSE 'OUT'
        END AS activity_type,

        wo.id AS wo_id,
        wo.wo_number,
        wo.wo_date,
        wo.wo_category,
        wot.name AS wo_type,

        part.id AS part_id,
        part.part_number,
        part.part_name,
        part.part_category,

        label.id AS label_id,
        label.label_number,

        1 AS kanban,
        COALESCE(pkg.capacity, wsl.qty_per_kanban, 1) AS qty_per_kanban,

        wa.id AS warehouse_area_id,
        wa.name AS warehouse_area,

        CASE 
          WHEN wsl.is_placement = false THEN bin.bin_code
          ELSE NULL
        END AS storage_bin_origin,

        CASE 
          WHEN wsl.is_placement = true THEN bin.bin_code
          ELSE NULL
        END AS storage_bin_destination,

        bin.id AS bin_id,
        bin.bin_code,

        wsl.created_at AS timestamp_activity,

        usr.id AS user_id,
        usr.email AS user,

        label.label_number AS qr_part,
        bin.bin_code AS qr_bin

      FROM t_warehouse_stock_log wsl
     LEFT JOIN t_work_order_storing wo
  ON wo.id = wsl.wo_id

LEFT JOIN t_work_order_storing_item_label wil
  ON wil.id = wsl.wo_item_label_id

LEFT JOIN t_part_labels label
  ON label.id = wsl.label_id

LEFT JOIN s_parts part
  ON part.id = wsl.part_id

LEFT JOIN s_packages pkg
  ON pkg.id = part.package_id

LEFT JOIN ref_work_order_storing_type wot
  ON wot.id = wo.wo_type_id

LEFT JOIN s_warehouse_areas wa
  ON wa.id = wo.warehouse_area_id

LEFT JOIN s_warehouse_bins bin
  ON bin.id = wsl.bin_id
      LEFT JOIN s_users usr ON usr.id = wsl.user_id

      ${whereClause}

      ORDER BY wsl.created_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    const countResult = await db.sequelize.query(`
      SELECT COUNT(*)::int AS count
      FROM t_warehouse_stock_log wsl
      LEFT JOIN t_work_order_storing wo
  ON wo.id = wsl.wo_id

LEFT JOIN t_work_order_storing_item_label wil
  ON wil.id = wsl.wo_item_label_id

LEFT JOIN t_part_labels label
  ON label.id = wsl.label_id

LEFT JOIN s_parts part
  ON part.id = wsl.part_id

LEFT JOIN s_packages pkg
  ON pkg.id = part.package_id

LEFT JOIN ref_work_order_storing_type wot
  ON wot.id = wo.wo_type_id

LEFT JOIN s_warehouse_areas wa
  ON wa.id = wo.warehouse_area_id

LEFT JOIN s_warehouse_bins bin
  ON bin.id = wsl.bin_id
      LEFT JOIN s_users usr ON usr.id = wsl.user_id

      ${whereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: helper.getPaginationData(rows, countResult[0]?.count || 0, page, limit)
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

export default new TransactionActivityModule();