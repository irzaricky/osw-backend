import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import BaseModule from '../../class/base.module.js';
import { QueryTypes } from 'sequelize';

class WarehouseAnalyticsModule extends BaseModule {
  buildFilters(query = {}) {
    const {
      date_from,
      date_to,
      warehouse_area_id,
      part_category,
      part_number,
      movement_type
    } = query;

    const replacements = {};
    const movementWhere = [];
    const stockWhere = [];

    if (date_from) {
      movementWhere.push(`wsl.created_at >= :date_from`);
      replacements.date_from = date_from;
    }

    if (date_to) {
      movementWhere.push(`wsl.created_at <= :date_to`);
      replacements.date_to = `${date_to} 23:59:59`;
    }

    if (warehouse_area_id) {
      stockWhere.push(`b.area_id = :warehouse_area_id`);
      movementWhere.push(`
        COALESCE(
          b.area_id,
          NULLIF(wsl.old_data->>'warehouse_area_id', '')::int
        ) = :warehouse_area_id
      `);
      replacements.warehouse_area_id = warehouse_area_id;
    }

    if (part_category) {
      stockWhere.push(`part.part_category = :part_category`);
      movementWhere.push(`part.part_category = :part_category`);
      replacements.part_category = part_category;
    }

    if (part_number) {
      stockWhere.push(`part.part_number ILIKE :part_number`);
      movementWhere.push(`
        COALESCE(
          part.part_number,
          wsl.old_data->>'part_number'
        ) ILIKE :part_number
      `);
      replacements.part_number = `%${part_number}%`;
    }

    if (movement_type === 'IN') {
      movementWhere.push(`wsl.is_placement = true`);
    }

    if (movement_type === 'OUT') {
      movementWhere.push(`wsl.is_placement = false`);
    }

    return {
      replacements,
      movementWhereClause: movementWhere.length ? `WHERE ${movementWhere.join(' AND ')}` : '',
      stockWhereClause: stockWhere.length ? `WHERE ${stockWhere.join(' AND ')}` : ''
    };
  }

  async executiveSummary(req) {
    try {
      const { replacements, stockWhereClause } = this.buildFilters(req.query);

      const rows = await db.sequelize.query(`
        SELECT
          COUNT(ws.id)::int AS total_kanban,
          COALESCE(SUM(pkg.capacity), 0)::int AS total_pcs,
          COUNT(DISTINCT part.id)::int AS total_parts,
          COUNT(DISTINCT ws.bin_id)::int AS occupied_bins,

          COUNT(DISTINCT part.id) FILTER (
            WHERE stock_by_part.total_kanban <= COALESCE(part.safety_stock, 0)
            AND COALESCE(part.safety_stock, 0) > 0
          )::int AS low_stock_parts,

          COUNT(ws.id) FILTER (
            WHERE COALESCE(place_log.placement_at, ws.created_at) <= NOW() - INTERVAL '7 days'
          )::int AS aging_stock_7_days,

          COUNT(ws.id) FILTER (
            WHERE COALESCE(place_log.placement_at, ws.created_at) <= NOW() - INTERVAL '30 days'
          )::int AS aging_stock_30_days

        FROM t_warehouse_stock ws
        JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
        JOIN t_part_labels label ON label.id = wil.label_id
        JOIN s_parts part ON part.id = label.part_id
        LEFT JOIN s_packages pkg ON pkg.id = part.package_id
        LEFT JOIN s_warehouse_bins b ON b.id = ws.bin_id

        LEFT JOIN (
          SELECT wh_stock_id, MIN(created_at) AS placement_at
          FROM t_warehouse_stock_log
          WHERE is_placement = true
          GROUP BY wh_stock_id
        ) place_log ON place_log.wh_stock_id = ws.id

        LEFT JOIN (
          SELECT
            label.part_id,
            COUNT(ws.id) AS total_kanban
          FROM t_warehouse_stock ws
          JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
          JOIN t_part_labels label ON label.id = wil.label_id
          GROUP BY label.part_id
        ) stock_by_part ON stock_by_part.part_id = part.id

        ${stockWhereClause}
      `, {
        replacements,
        type: QueryTypes.SELECT
      });

      const utilizationRows = await db.sequelize.query(`
        SELECT
          COUNT(b.id)::int AS total_bins,
          COALESCE(SUM(b.capacity), 0)::int AS total_capacity,
          COALESCE(SUM(stock.used_capacity), 0)::int AS used_capacity,
          CASE
            WHEN COALESCE(SUM(b.capacity), 0) > 0
            THEN ROUND((COALESCE(SUM(stock.used_capacity), 0)::decimal / SUM(b.capacity)::decimal) * 100, 4)
            ELSE 0
          END AS utilization_percentage
        FROM s_warehouse_bins b
        LEFT JOIN (
          SELECT bin_id, COUNT(*) AS used_capacity
          FROM t_warehouse_stock
          GROUP BY bin_id
        ) stock ON stock.bin_id = b.id
        ${req.query.warehouse_area_id ? 'WHERE b.area_id = :warehouse_area_id' : ''}
      `, {
        replacements,
        type: QueryTypes.SELECT
      });

      return {
        status: true,
        data: {
          ...(rows[0] || {}),
          ...(utilizationRows[0] || {})
        }
      };
    } catch (error) {
      return config.debug
        ? { status: false, error: error.message, code: 500 }
        : { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async stockMovement(req) {
  try {
    const { replacements, movementWhereClause } = this.buildFilters(req.query);

    const rows = await db.sequelize.query(`
      SELECT
        DATE(wsl.created_at) AS movement_date,
        COUNT(*) FILTER (WHERE wsl.is_placement = true)::int AS placement,
        COUNT(*) FILTER (WHERE wsl.is_placement = false)::int AS take_out
      FROM t_warehouse_stock_log wsl
      LEFT JOIN t_work_order_storing wo
        ON wo.id = wsl.wo_id
      LEFT JOIN t_part_labels label
        ON label.id = wsl.label_id
      LEFT JOIN s_parts part
        ON part.id = wsl.part_id
      LEFT JOIN s_warehouse_bins b
        ON b.id = wsl.bin_id
      ${movementWhereClause}
      GROUP BY DATE(wsl.created_at)
      ORDER BY movement_date ASC
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: rows
    };
  } catch (error) {
    return config.debug
      ? { status: false, error: error.message, code: 500 }
      : { status: false, message: 'Internal server error', code: 500 };
  }
}

  async fastMoving(req) {
  try {
    const { replacements, movementWhereClause } = this.buildFilters({
      ...req.query,
      movement_type: 'OUT'
    });

    const rows = await db.sequelize.query(`
      SELECT
        part.id AS part_id,
        part.part_number,
        part.part_name,
        part.part_category,
        COUNT(wsl.id)::int AS movement_count,
        COALESCE(SUM(COALESCE(pkg.capacity, 1)), 0)::int AS total_pcs_out
      FROM t_warehouse_stock_log wsl
      LEFT JOIN s_parts part
        ON part.id = wsl.part_id
      LEFT JOIN s_packages pkg
        ON pkg.id = part.package_id
      LEFT JOIN s_warehouse_bins b
        ON b.id = wsl.bin_id
      ${movementWhereClause}
      GROUP BY
        part.id,
        part.part_number,
        part.part_name,
        part.part_category
      HAVING part.id IS NOT NULL
      ORDER BY movement_count DESC
      LIMIT 5
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: rows
    };
  } catch (error) {
    return config.debug
      ? { status: false, error: error.message, code: 500 }
      : { status: false, message: 'Internal server error', code: 500 };
  }
}

  async slowMoving(req) {
    try {
      const { replacements, stockWhereClause } = this.buildFilters(req.query);

      const rows = await db.sequelize.query(`
        SELECT
          part.id AS part_id,
          part.part_number,
          part.part_name,
          part.part_category,
          COUNT(ws.id)::int AS total_kanban,
          MIN(COALESCE(place_log.placement_at, ws.created_at)) AS oldest_stock_at,
          EXTRACT(DAY FROM NOW() - MIN(COALESCE(place_log.placement_at, ws.created_at)))::int AS oldest_aging_days
        FROM t_warehouse_stock ws
        JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
        JOIN t_part_labels label ON label.id = wil.label_id
        JOIN s_parts part ON part.id = label.part_id
        LEFT JOIN s_warehouse_bins b ON b.id = ws.bin_id
        LEFT JOIN (
          SELECT wh_stock_id, MIN(created_at) AS placement_at
          FROM t_warehouse_stock_log
          WHERE is_placement = true
          GROUP BY wh_stock_id
        ) place_log ON place_log.wh_stock_id = ws.id
        ${stockWhereClause}
        GROUP BY part.id, part.part_number, part.part_name, part.part_category
        ORDER BY oldest_aging_days DESC, total_kanban DESC
        LIMIT 5
      `, {
        replacements,
        type: QueryTypes.SELECT
      });

      return {
        status: true,
        data: rows
      };
    } catch (error) {
      return config.debug
        ? { status: false, error: error.message, code: 500 }
        : { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async utilization(req) {
    try {
      const { warehouse_area_id } = req.query;
      const replacements = {};
      const where = [];

      if (warehouse_area_id) {
        where.push(`wa.id = :warehouse_area_id`);
        replacements.warehouse_area_id = warehouse_area_id;
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const rows = await db.sequelize.query(`
        SELECT
          wa.id AS warehouse_area_id,
          wa.name AS warehouse_area,
          COUNT(b.id)::int AS total_bins,
          COALESCE(SUM(b.capacity), 0)::int AS total_capacity,
          COALESCE(SUM(stock.used_capacity), 0)::int AS used_capacity,
          GREATEST(COALESCE(SUM(b.capacity), 0) - COALESCE(SUM(stock.used_capacity), 0), 0)::int AS remaining_capacity,
          CASE
            WHEN COALESCE(SUM(b.capacity), 0) > 0
            THEN ROUND((COALESCE(SUM(stock.used_capacity), 0)::decimal / SUM(b.capacity)::decimal) * 100, 2)
            ELSE 0
          END AS utilization_percentage
        FROM s_warehouse_areas wa
        LEFT JOIN s_warehouse_bins b ON b.area_id = wa.id
        LEFT JOIN (
          SELECT bin_id, COUNT(*) AS used_capacity
          FROM t_warehouse_stock
          GROUP BY bin_id
        ) stock ON stock.bin_id = b.id
        ${whereClause}
        GROUP BY wa.id, wa.name
        ORDER BY utilization_percentage DESC
      `, {
        replacements,
        type: QueryTypes.SELECT
      });

      return {
        status: true,
        data: rows
      };
    } catch (error) {
      return config.debug
        ? { status: false, error: error.message, code: 500 }
        : { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async fifoCompliance(req) {
  try {
    const { replacements, movementWhereClause } = this.buildFilters({
      ...req.query,
      movement_type: 'OUT'
    });

    const rows = await db.sequelize.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(wsl.fifo_override, false) = false
        )::int AS fifo_compliant,

        COUNT(*) FILTER (
          WHERE COALESCE(wsl.fifo_override, false) = true
        )::int AS fifo_override,

        COUNT(*)::int AS total_takeout,

        CASE
          WHEN COUNT(*) > 0
          THEN ROUND(
            (
              COUNT(*) FILTER (
                WHERE COALESCE(wsl.fifo_override, false) = false
              )::decimal / COUNT(*)::decimal
            ) * 100,
            2
          )
          ELSE 0
        END AS fifo_compliance_rate
      FROM t_warehouse_stock_log wsl
      LEFT JOIN t_work_order_storing wo
        ON wo.id = wsl.wo_id
      LEFT JOIN t_part_labels label
        ON label.id = wsl.label_id
      LEFT JOIN s_parts part
        ON part.id = wsl.part_id
      LEFT JOIN s_warehouse_bins b
        ON b.id = wsl.bin_id
      ${movementWhereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: rows[0]
    };
  } catch (error) {
    return config.debug
      ? { status: false, error: error.message, code: 500 }
      : { status: false, message: 'Internal server error', code: 500 };
  }
}

async fifoViolationDetails(req) {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 5);
    const offset = (page - 1) * limit;

    const { replacements, movementWhereClause } = this.buildFilters({
      ...req.query,
      movement_type: 'OUT'
    });

    const whereClause = movementWhereClause
      ? `${movementWhereClause} AND COALESCE(wsl.fifo_override, false) = true`
      : `WHERE wsl.is_placement = false AND COALESCE(wsl.fifo_override, false) = true`;

    const queryReplacements = {
      ...replacements,
      limit,
      offset
    };

    const rows = await db.sequelize.query(`
      SELECT
        wsl.id,
        wsl.created_at AS transaction_date,
        wo.wo_number,
        part.part_number,
        part.part_name,
        selected_label.label_number AS selected_label,
        wsl.recommended_label_number,
        usr.email AS user
      FROM t_warehouse_stock_log wsl
      LEFT JOIN t_work_order_storing wo
        ON wo.id = wsl.wo_id
      LEFT JOIN s_parts part
        ON part.id = wsl.part_id
      LEFT JOIN t_part_labels selected_label
        ON selected_label.id = wsl.label_id
      LEFT JOIN s_warehouse_bins b
        ON b.id = wsl.bin_id
      LEFT JOIN s_users usr
        ON usr.id = wsl.user_id
      ${whereClause}
      ORDER BY wsl.created_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: queryReplacements,
      type: QueryTypes.SELECT
    });

    const totalResult = await db.sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM t_warehouse_stock_log wsl
      LEFT JOIN t_work_order_storing wo
        ON wo.id = wsl.wo_id
      LEFT JOIN s_parts part
        ON part.id = wsl.part_id
      LEFT JOIN t_part_labels selected_label
        ON selected_label.id = wsl.label_id
      LEFT JOIN s_warehouse_bins b
        ON b.id = wsl.bin_id
      LEFT JOIN s_users usr
        ON usr.id = wsl.user_id
      ${whereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    const total = totalResult[0]?.total || 0;

    return {
      status: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    return config.debug
      ? { status: false, error: error.message, code: 500 }
      : { status: false, message: 'Internal server error', code: 500 };
  }
}

async agingDistribution(req) {
  try {
    const { replacements, stockWhereClause } = this.buildFilters(req.query);

    const rows = await db.sequelize.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE aging_days <= 7
        )::int AS fresh_stock,

        COUNT(*) FILTER (
          WHERE aging_days > 7
          AND aging_days <= 30
        )::int AS medium_stock,

        COUNT(*) FILTER (
          WHERE aging_days > 30
        )::int AS old_stock

      FROM (
        SELECT
          EXTRACT(
            DAY FROM NOW() - COALESCE(place_log.placement_at, ws.created_at)
          )::int AS aging_days

        FROM t_warehouse_stock ws

        JOIN t_work_order_storing_item_label wil
          ON wil.id = ws.wo_item_label_id

        JOIN t_part_labels label
          ON label.id = wil.label_id

        JOIN s_parts part
          ON part.id = label.part_id

        LEFT JOIN s_warehouse_bins b
          ON b.id = ws.bin_id

        LEFT JOIN (
          SELECT
            wh_stock_id,
            MIN(created_at) AS placement_at
          FROM t_warehouse_stock_log
          WHERE is_placement = true
          GROUP BY wh_stock_id
        ) place_log ON place_log.wh_stock_id = ws.id

        ${stockWhereClause}
      ) aging
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: rows[0]
    };
  } catch (error) {
    return config.debug
      ? { status: false, error: error.message, code: 500 }
      : { status: false, message: 'Internal server error', code: 500 }
  }
}

async inventoryValue(req) {
  try {
    const { replacements, stockWhereClause } = this.buildFilters(req.query);

    const rows = await db.sequelize.query(`
      SELECT
        COALESCE(SUM(COALESCE(pkg.capacity, 1) * COALESCE(part.price, 0)), 0)::numeric AS total_inventory_value,
        COALESCE(SUM(pkg.capacity), 0)::int AS total_pcs,
        COUNT(ws.id)::int AS total_kanban,
        COUNT(DISTINCT part.id)::int AS total_parts
      FROM t_warehouse_stock ws
      JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
      JOIN t_part_labels label ON label.id = wil.label_id
      JOIN s_parts part ON part.id = label.part_id
      LEFT JOIN s_packages pkg ON pkg.id = part.package_id
      LEFT JOIN s_warehouse_bins b ON b.id = ws.bin_id
      ${stockWhereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    const areaRows = await db.sequelize.query(`
      SELECT
        wa.id AS warehouse_area_id,
        wa.name AS warehouse_area,
        COALESCE(SUM(COALESCE(pkg.capacity, 1) * COALESCE(part.price, 0)), 0)::numeric AS inventory_value,
        COUNT(ws.id)::int AS total_kanban,
        COALESCE(SUM(pkg.capacity), 0)::int AS total_pcs
      FROM t_warehouse_stock ws
      JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
      JOIN t_part_labels label ON label.id = wil.label_id
      JOIN s_parts part ON part.id = label.part_id
      LEFT JOIN s_packages pkg ON pkg.id = part.package_id
      LEFT JOIN s_warehouse_bins b ON b.id = ws.bin_id
      LEFT JOIN s_warehouse_areas wa ON wa.id = b.area_id
      ${stockWhereClause}
      GROUP BY wa.id, wa.name
      ORDER BY inventory_value DESC
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    const categoryRows = await db.sequelize.query(`
      SELECT
        part.part_type_code,
        COUNT(ws.id)::int AS total_kanban,
        COALESCE(SUM(COALESCE(pkg.capacity, 1)), 0)::int AS total_pcs,
        COALESCE(
          SUM(COALESCE(pkg.capacity, 1) * COALESCE(part.price, 0)),
          0
        )::numeric AS inventory_value
      FROM t_warehouse_stock ws
      JOIN t_work_order_storing_item_label wil
        ON wil.id = ws.wo_item_label_id
      JOIN t_part_labels label
        ON label.id = wil.label_id
      JOIN s_parts part
        ON part.id = label.part_id
      LEFT JOIN s_packages pkg
        ON pkg.id = part.package_id
      LEFT JOIN s_warehouse_bins b
        ON b.id = ws.bin_id
      ${stockWhereClause}
      GROUP BY part.part_type_code
      ORDER BY inventory_value DESC
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: {
        summary: rows[0] || {},
        by_area: areaRows,
        by_category: categoryRows
      }
    };
  } catch (error) {
    return config.debug
      ? { status: false, error: error.message, code: 500 }
      : { status: false, message: 'Internal server error', code: 500 };
  }
}

async topInventoryValue(req) {
  try {
    const { replacements, stockWhereClause } = this.buildFilters(req.query);

    const rows = await db.sequelize.query(`
      SELECT
        part.id AS part_id,
        part.part_number,
        part.part_name,
        part.part_category,
        COALESCE(part.price, 0)::numeric AS price,
        COALESCE(pkg.capacity, 1)::int AS capacity_per_kanban,
        COUNT(ws.id)::int AS total_kanban,
        COALESCE(SUM(pkg.capacity), 0)::int AS total_pcs,
        COALESCE(SUM(COALESCE(pkg.capacity, 1) * COALESCE(part.price, 0)), 0)::numeric AS inventory_value
      FROM t_warehouse_stock ws
      JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
      JOIN t_part_labels label ON label.id = wil.label_id
      JOIN s_parts part ON part.id = label.part_id
      LEFT JOIN s_packages pkg ON pkg.id = part.package_id
      LEFT JOIN s_warehouse_bins b ON b.id = ws.bin_id
      ${stockWhereClause}
      GROUP BY
        part.id,
        part.part_number,
        part.part_name,
        part.part_category,
        part.price,
        pkg.capacity
      ORDER BY inventory_value DESC
      LIMIT 5
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: rows
    };
  } catch (error) {
    return config.debug
      ? { status: false, error: error.message, code: 500 }
      : { status: false, message: 'Internal server error', code: 500 };
  }
}
async inventoryHealth(req) {
  try {
    const { replacements, stockWhereClause } = this.buildFilters(req.query);

    const rows = await db.sequelize.query(`
      WITH stock_summary AS (
        SELECT
          part.id AS part_id,
          part.part_number,
          part.part_name,
          part.part_category,
          COALESCE(part.safety_stock, 0) AS safety_stock,
          COUNT(ws.id)::int AS total_kanban
        FROM s_parts part

        LEFT JOIN t_part_labels label
          ON label.part_id = part.id

        LEFT JOIN t_work_order_storing_item_label wil
          ON wil.label_id = label.id

        LEFT JOIN t_warehouse_stock ws
          ON ws.wo_item_label_id = wil.id

        LEFT JOIN s_warehouse_bins b
          ON b.id = ws.bin_id

        ${stockWhereClause}

        GROUP BY
          part.id,
          part.part_number,
          part.part_name,
          part.part_category,
          part.safety_stock
      )

      SELECT
        COUNT(*) FILTER (
          WHERE total_kanban = 0
        )::int AS out_of_stock,

        COUNT(*) FILTER (
          WHERE safety_stock > 0
            AND total_kanban > 0
            AND total_kanban < safety_stock
        )::int AS critical_stock,

        COUNT(*) FILTER (
          WHERE safety_stock > 0
            AND total_kanban >= safety_stock
            AND total_kanban <= (safety_stock * 2)
        )::int AS safe_stock,

        COUNT(*) FILTER (
          WHERE safety_stock > 0
            AND total_kanban > (safety_stock * 2)
        )::int AS overstock
      FROM stock_summary
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: rows[0]
    };
  } catch (error) {
    return config.debug
      ? { status: false, error: error.message, code: 500 }
      : { status: false, message: 'Internal server error', code: 500 };
  }
}

async criticalParts(req) {
  try {
    const { replacements, stockWhereClause } = this.buildFilters(req.query);

    const rows = await db.sequelize.query(`
      WITH stock_summary AS (
        SELECT
          part.id AS part_id,
          part.part_number,
          part.part_name,
          part.part_category,
          COALESCE(part.safety_stock, 0) AS safety_stock,

          COUNT(ws.id)::int AS total_kanban,

          COALESCE(
            MIN(place_log.created_at),
            MIN(ws.created_at)
          ) AS oldest_stock_at,

          MAX(wa.name) AS warehouse_area

        FROM s_parts part

        LEFT JOIN t_part_labels label
          ON label.part_id = part.id

        LEFT JOIN t_work_order_storing_item_label wil
          ON wil.label_id = label.id

        LEFT JOIN t_warehouse_stock ws
          ON ws.wo_item_label_id = wil.id

        LEFT JOIN s_warehouse_bins bin
          ON bin.id = ws.bin_id

        LEFT JOIN s_warehouse_areas wa
          ON wa.id = bin.area_id

        LEFT JOIN t_warehouse_stock_log place_log
          ON place_log.wh_stock_id = ws.id
          AND place_log.is_placement = true

        LEFT JOIN s_warehouse_bins b
          ON b.id = ws.bin_id

        ${stockWhereClause}

        GROUP BY
          part.id,
          part.part_number,
          part.part_name,
          part.part_category,
          part.safety_stock
      )

      SELECT
        *,
        CASE
          WHEN total_kanban = 0 THEN 'Out of Stock'
          WHEN safety_stock > 0 AND total_kanban <= (safety_stock * 0.25) THEN 'Critical'
          WHEN safety_stock > 0 AND total_kanban < safety_stock THEN 'Below Safety'
          ELSE 'Safe'
        END AS stock_status,

        CASE
          WHEN safety_stock > 0
          THEN ROUND((total_kanban::decimal / safety_stock::decimal) * 100, 2)
          ELSE 0
        END AS stock_percentage,

        CASE
          WHEN oldest_stock_at IS NOT NULL
          THEN EXTRACT(DAY FROM NOW() - oldest_stock_at)::int
          ELSE NULL
        END AS aging_days

      FROM stock_summary

      WHERE
        total_kanban = 0
        OR (
          safety_stock > 0
          AND total_kanban < safety_stock
        )

      ORDER BY
        stock_percentage ASC,
        aging_days DESC NULLS LAST
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: rows
    };
  } catch (error) {
    return config.debug
      ? { status: false, error: error.message, code: 500 }
      : { status: false, message: 'Internal server error', code: 500 };
  }
}
}

export default new WarehouseAnalyticsModule();