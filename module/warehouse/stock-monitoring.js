import { Op, fn, col, literal, QueryTypes } from 'sequelize'
import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const {
  TWarehouseStock,
  TWarehouseStockLog,
  SWarehouseBins,
  SWarehouseAreas,
  SWarehouses,
  TPartLabels,
  SParts
} = db

class StockMonitoringModule {

  // =========================
  // SUMMARY CARD
  // =========================
  async summary(req) {
  try {
    const [summaryRows] = await db.sequelize.query(`
      SELECT
        COUNT(ws.id)::int AS total_kanban,
        COUNT(DISTINCT label.part_id)::int AS total_parts,
        COUNT(DISTINCT ws.bin_id)::int AS occupied_bins,
        COALESCE(SUM(pkg.capacity), 0)::int AS total_pcs,

        COUNT(DISTINCT label.part_id) FILTER (
          WHERE stock_by_part.total_kanban <= COALESCE(part.safety_stock, 0)
          AND COALESCE(part.safety_stock, 0) > 0
        )::int AS low_stock_parts,

        COUNT(ws.id) FILTER (
          WHERE COALESCE(place_log.placement_at, ws.created_at) <= NOW() - INTERVAL '7 days'
        )::int AS stock_aging_7_days,

        COUNT(ws.id) FILTER (
          WHERE COALESCE(place_log.placement_at, ws.created_at) <= NOW() - INTERVAL '30 days'
        )::int AS stock_aging_30_days,

        MIN(COALESCE(place_log.placement_at, ws.created_at)) AS oldest_stock_at

      FROM t_warehouse_stock ws
      JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
      JOIN t_part_labels label ON label.id = wil.label_id
      JOIN s_parts part ON part.id = label.part_id
      LEFT JOIN s_packages pkg ON pkg.id = part.package_id

      LEFT JOIN (
        SELECT
          wh_stock_id,
          MIN(created_at) AS placement_at
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
      ) stock_by_part ON stock_by_part.part_id = label.part_id
    `)

    const [binRows] = await db.sequelize.query(`
      SELECT
        COUNT(b.id)::int AS total_bins,
        COUNT(*) FILTER (
          WHERE COALESCE(stock.used_capacity, 0) > 0
        )::int AS occupied_bins_check,
        COUNT(*) FILTER (
          WHERE COALESCE(b.capacity, 0) > 0
            AND COALESCE(stock.used_capacity, 0) >= COALESCE(b.capacity, 0)
        )::int AS full_bins,  
        COUNT(*) FILTER (
          WHERE COALESCE(b.capacity, 0) > 0
            AND COALESCE(stock.used_capacity, 0) = 0
        )::int AS empty_bins,
        COUNT(*) FILTER (
          WHERE COALESCE(b.capacity, 0) > 0
            AND COALESCE(stock.used_capacity, 0) >= (b.capacity * 0.8)
            AND COALESCE(stock.used_capacity, 0) < b.capacity
        )::int AS low_capacity_bins
      FROM s_warehouse_bins b
      LEFT JOIN (
        SELECT bin_id, COUNT(*) AS used_capacity
        FROM t_warehouse_stock
        GROUP BY bin_id
      ) stock ON stock.bin_id = b.id
    `)

    const stockSummary = summaryRows?.[0] || {}
    const binSummary = binRows?.[0] || {}

    const lowStockPreview = await db.sequelize.query(`
  SELECT
    part.part_number,
    part.part_name,
    COUNT(ws.id)::int AS total_kanban,
    COALESCE(part.safety_stock, 0)::int AS safety_stock
  FROM t_warehouse_stock ws
  JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
  JOIN t_part_labels label ON label.id = wil.label_id
  JOIN s_parts part ON part.id = label.part_id
  GROUP BY part.id, part.part_number, part.part_name, part.safety_stock
  HAVING COUNT(ws.id) <= COALESCE(part.safety_stock, 0)
     AND COALESCE(part.safety_stock, 0) > 0
  ORDER BY total_kanban ASC, part.part_number ASC
  LIMIT 3
`, {
  type: QueryTypes.SELECT
})

const agingPreview = await db.sequelize.query(`
  SELECT
    pl.label_number,
    part.part_number,
    part.part_name,
    b.bin_code,
    COALESCE(place_log.placement_at, ws.created_at) AS placement_at,
    EXTRACT(DAY FROM NOW() - COALESCE(place_log.placement_at, ws.created_at))::int AS aging_days
  FROM t_warehouse_stock ws
  JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
  JOIN t_part_labels pl ON pl.id = wil.label_id
  JOIN s_parts part ON part.id = pl.part_id
  LEFT JOIN s_warehouse_bins b ON b.id = ws.bin_id
  LEFT JOIN (
    SELECT wh_stock_id, MIN(created_at) AS placement_at
    FROM t_warehouse_stock_log
    WHERE is_placement = true
    GROUP BY wh_stock_id
  ) place_log ON place_log.wh_stock_id = ws.id
  WHERE COALESCE(place_log.placement_at, ws.created_at) <= NOW() - INTERVAL '7 days'
  ORDER BY placement_at ASC
  LIMIT 3
`, {
  type: QueryTypes.SELECT
})

const fullBinPreview = await db.sequelize.query(`
  SELECT
    b.bin_code,
    wa.name AS warehouse_area,
    b.capacity,
    COALESCE(stock.used_capacity, 0)::int AS used_capacity
  FROM s_warehouse_bins b
  LEFT JOIN s_warehouse_areas wa ON wa.id = b.area_id
  LEFT JOIN (
    SELECT bin_id, COUNT(*) AS used_capacity
    FROM t_warehouse_stock
    GROUP BY bin_id
  ) stock ON stock.bin_id = b.id
  WHERE COALESCE(stock.used_capacity, 0) >= COALESCE(b.capacity, 0)
  ORDER BY b.bin_code ASC
  LIMIT 3
`, {
  type: QueryTypes.SELECT
})

    const lowCapacityPreview = await db.sequelize.query(`
    SELECT
        b.bin_code,
        wa.name AS warehouse_area,
        b.capacity,
        COALESCE(stock.used_capacity, 0)::int AS used_capacity,
        GREATEST(COALESCE(b.capacity, 0) - COALESCE(stock.used_capacity, 0), 0)::int AS remaining_capacity
    FROM s_warehouse_bins b
    LEFT JOIN s_warehouse_areas wa ON wa.id = b.area_id
    LEFT JOIN (
        SELECT bin_id, COUNT(*) AS used_capacity
        FROM t_warehouse_stock
        GROUP BY bin_id
    ) stock ON stock.bin_id = b.id
    WHERE COALESCE(stock.used_capacity, 0) >= (COALESCE(b.capacity, 0) * 0.8)
        AND COALESCE(stock.used_capacity, 0) < COALESCE(b.capacity, 0)
    ORDER BY remaining_capacity ASC, b.bin_code ASC
    LIMIT 3
    `, {
    type: QueryTypes.SELECT
    })

    return {
      status: true,
      data: {
        total_kanban: Number(stockSummary.total_kanban || 0),
        total_pcs: Number(stockSummary.total_pcs || 0),
        total_parts: Number(stockSummary.total_parts || 0),
        occupied_bins: Number(stockSummary.occupied_bins || 0),

        total_bins: Number(binSummary.total_bins || 0),
        full_bins: Number(binSummary.full_bins || 0),
        empty_bins: Number(binSummary.empty_bins || 0),
        low_capacity_bins: Number(binSummary.low_capacity_bins || 0),

        low_stock_parts: Number(stockSummary.low_stock_parts || 0),
        stock_aging_7_days: Number(stockSummary.stock_aging_7_days || 0),
        stock_aging_30_days: Number(stockSummary.stock_aging_30_days || 0),
        oldest_stock_at: stockSummary.oldest_stock_at || null,

        low_stock_preview: lowStockPreview,
        aging_preview: agingPreview,
        full_bin_preview: fullBinPreview,
        low_capacity_preview: lowCapacityPreview
      }
    }
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    }
  }
}

  // =========================
  // STOCK BY PART
  // =========================
  async stockByPart(req) {
  try {
    const {
    search,
    part_category,
    low_stock_only,
    aging_only,
    stock_status,
    date_from,
    date_to
    } = req.query

    const where = []
    const replacements = {}

    if (date_from) {
  where.push(`
    DATE(COALESCE(place_log.placement_at, ws.created_at)) >= :date_from
  `)

  replacements.date_from = date_from
}

if (date_to) {
  where.push(`
    DATE(COALESCE(place_log.placement_at, ws.created_at)) <= :date_to
  `)

  replacements.date_to = date_to
}

    if (search) {
      where.push(`(
        part.part_number ILIKE :search OR
        part.part_name ILIKE :search
      )`)
      replacements.search = `%${search}%`
    }

    if (part_category) {
      where.push(`part.part_category = :part_category`)
      replacements.part_category = part_category
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const having = []

if (low_stock_only === 'true') {
  having.push(`
    COUNT(ws.id) <= COALESCE(part.safety_stock, 0)
    AND COALESCE(part.safety_stock, 0) > 0
  `)
}

if (aging_only === 'true') {
  having.push(`
    COUNT(ws.id) FILTER (
      WHERE COALESCE(place_log.placement_at, ws.created_at) <= NOW() - INTERVAL '7 days'
    ) > 0
  `)
}

if (stock_status) {
  having.push(`
    CASE
      WHEN COALESCE(part.safety_stock, 0) > 0
        AND COUNT(ws.id) <= (COALESCE(part.safety_stock, 0) * 0.5)
      THEN 'Critical'
      WHEN COALESCE(part.safety_stock, 0) > 0
        AND COUNT(ws.id) <= COALESCE(part.safety_stock, 0)
      THEN 'Warning'
      ELSE 'Safe'
    END = :stock_status
  `)

  replacements.stock_status = stock_status
}

const havingClause = having.length
  ? `HAVING ${having.join(' AND ')}`
  : ''

    const rows = await db.sequelize.query(`
      SELECT
        part.id AS part_id,
        part.part_number,
        part.part_name,
        part.part_category,
        COALESCE(part.safety_stock, 0)::int AS safety_stock,
                CASE
        WHEN COALESCE(part.safety_stock, 0) > 0
        THEN ROUND(
            (COUNT(ws.id)::decimal / COALESCE(part.safety_stock, 0)::decimal) * 100,
            2
        )
        ELSE 0
        END AS coverage_percentage,

        CASE
        WHEN COALESCE(part.safety_stock, 0) > 0
            AND COUNT(ws.id) <= (COALESCE(part.safety_stock, 0) * 0.5)
        THEN 'Critical'
        WHEN COALESCE(part.safety_stock, 0) > 0
            AND COUNT(ws.id) <= COALESCE(part.safety_stock, 0)
        THEN 'Warning'
        ELSE 'Safe'
        END AS stock_status,

        pkg.id AS package_id,
        pkg.package_code,
        pkg.name AS package_name,
        COALESCE(pkg.capacity, 0)::int AS capacity_per_kanban,

        COUNT(ws.id)::int AS total_kanban,
        (COUNT(ws.id) * COALESCE(pkg.capacity, 0))::int AS total_pcs,
        COUNT(DISTINCT ws.bin_id)::int AS total_bins,

        CASE
          WHEN COUNT(ws.id) <= COALESCE(part.safety_stock, 0)
          AND COALESCE(part.safety_stock, 0) > 0
          THEN true
          ELSE false
        END AS is_low_stock,

        MIN(COALESCE(place_log.placement_at, ws.created_at)) AS oldest_stock_at,
        MAX(COALESCE(place_log.placement_at, ws.created_at)) AS latest_stock_at,

        COUNT(ws.id) FILTER (
          WHERE COALESCE(place_log.placement_at, ws.created_at) <= NOW() - INTERVAL '7 days'
        )::int AS aging_7_days,

        COUNT(ws.id) FILTER (
          WHERE COALESCE(place_log.placement_at, ws.created_at) <= NOW() - INTERVAL '30 days'
        )::int AS aging_30_days

      FROM t_warehouse_stock ws
      JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
      JOIN t_part_labels label ON label.id = wil.label_id
      JOIN s_parts part ON part.id = label.part_id
      LEFT JOIN s_packages pkg ON pkg.id = part.package_id

      LEFT JOIN (
        SELECT
          wh_stock_id,
          MIN(created_at) AS placement_at
        FROM t_warehouse_stock_log
        WHERE is_placement = true
        GROUP BY wh_stock_id
      ) place_log ON place_log.wh_stock_id = ws.id

      ${whereClause}

      GROUP BY
        part.id,
        part.part_number,
        part.part_name,
        part.part_category,
        part.safety_stock,
        pkg.id,
        pkg.package_code,
        pkg.name,
        pkg.capacity

      ${havingClause}

      ORDER BY is_low_stock DESC, part.part_number ASC
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    return {
      status: true,
      data: rows
    }
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    }
  }
}

  // =========================
  // DETAIL LABEL PER PART
  // =========================
  async stockPartDetail(req) {
    try {
        const { part_number } = req.params;

        const rows = await db.sequelize.query(`
        SELECT
            ws.id AS stock_id,
            label.label_number,
            part.part_number,
            part.part_name,

            b.id AS bin_id,
            b.bin_code,
            wa.name AS warehouse_area,
            usr.email AS placed_by,

            COALESCE(pkg.capacity, 0) AS qty_per_kanban,

            ws.created_at AS placement_date

        FROM t_warehouse_stock ws
        JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
        JOIN t_part_labels label ON label.id = wil.label_id
        JOIN s_parts part ON part.id = label.part_id
        LEFT JOIN s_packages pkg ON pkg.id = part.package_id
        LEFT JOIN s_warehouse_bins b ON b.id = ws.bin_id
        LEFT JOIN s_warehouse_areas wa ON wa.id = b.area_id
        LEFT JOIN t_warehouse_stock_log place_log
          ON place_log.wh_stock_id = ws.id
          AND place_log.is_placement = true
        LEFT JOIN s_users usr
          ON usr.id = place_log.user_id

        WHERE part.part_number = :part_number

        ORDER BY ws.created_at ASC
        `, {
        replacements: { part_number },
        type: QueryTypes.SELECT
        });

        return {
        status: true,
        data: rows
        };

    } catch (error) {
        return {
        status: false,
        error: error.message,
        code: 500
        };
    }
    }
  // =========================
  // STOCK BY BIN
  // =========================
  async stockByBin(req) {
  try {
    const {
    search,
    warehouse_area_id,
    status,
    low_capacity_only,
    date_from,
    date_to
    } = req.query

    const where = []
    const replacements = {}

    if (date_from) {
  where.push(`
    EXISTS (
      SELECT 1
      FROM t_warehouse_stock ws2
      WHERE ws2.bin_id = b.id
      AND DATE(ws2.created_at) >= :date_from
    )
  `)

  replacements.date_from = date_from
}

if (date_to) {
  where.push(`
    EXISTS (
      SELECT 1
      FROM t_warehouse_stock ws2
      WHERE ws2.bin_id = b.id
      AND DATE(ws2.created_at) <= :date_to
    )
  `)

  replacements.date_to = date_to
}

    if (search) {
      where.push(`(
        b.bin_code ILIKE :search OR
        wa.name ILIKE :search OR
        b.dedicated_part_number ILIKE :search
      )`)
      replacements.search = `%${search}%`
    }

    if (warehouse_area_id) {
      where.push(`b.area_id = :warehouse_area_id`)
      replacements.warehouse_area_id = warehouse_area_id
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const finalWhere = []

if (status) {
  finalWhere.push(`final.status = :status`)
  replacements.status = status
}

if (low_capacity_only === 'true') {
  finalWhere.push(`final.is_low_capacity = true`)
}

const finalWhereClause = finalWhere.length
  ? `WHERE ${finalWhere.join(' AND ')}`
  : ''

    if (status) {
      replacements.status = status
    }

    const rows = await db.sequelize.query(`
      SELECT *
      FROM (
        SELECT
          b.id AS bin_id,
          b.bin_code,
          b.area_id,
          wa.name AS warehouse_area,
          b.capacity,
          b.is_dedicated,
          b.dedicated_part_number,

          COALESCE(stock.used_capacity, 0)::int AS used_capacity,
          GREATEST(COALESCE(b.capacity, 0) - COALESCE(stock.used_capacity, 0), 0)::int AS remaining_capacity,

          COALESCE(stock.total_parts, 0)::int AS total_part_variant,
          COALESCE(stock.total_kanban, 0)::int AS total_kanban,
          COALESCE(stock.total_pcs, 0)::int AS total_pcs,

          CASE
            WHEN COALESCE(b.capacity, 0) <= 0 THEN 'Unconfigured'
            WHEN COALESCE(stock.used_capacity, 0) = 0 THEN 'Empty'
            WHEN COALESCE(stock.used_capacity, 0) >= COALESCE(b.capacity, 0) THEN 'Full'
            ELSE 'Available'
          END AS status,

          CASE
            WHEN COALESCE(stock.used_capacity, 0) >= (COALESCE(b.capacity, 0) * 0.8)
            AND COALESCE(stock.used_capacity, 0) < COALESCE(b.capacity, 0)
            THEN true
            ELSE false
          END AS is_low_capacity

        FROM s_warehouse_bins b
        LEFT JOIN s_warehouse_areas wa ON wa.id = b.area_id
        LEFT JOIN (
          SELECT
            ws.bin_id,
            COUNT(ws.id) AS used_capacity,
            COUNT(ws.id) AS total_kanban,
            COUNT(DISTINCT label.part_id) AS total_parts,
            COALESCE(SUM(pkg.capacity), 0) AS total_pcs
          FROM t_warehouse_stock ws
          JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
          JOIN t_part_labels label ON label.id = wil.label_id
          JOIN s_parts part ON part.id = label.part_id
          LEFT JOIN s_packages pkg ON pkg.id = part.package_id
          GROUP BY ws.bin_id
        ) stock ON stock.bin_id = b.id

        ${whereClause}
      ) final

      ${finalWhereClause}

      ORDER BY
        CASE final.status
          WHEN 'Full' THEN 1
          WHEN 'Available' THEN 2
          WHEN 'Empty' THEN 3
          ELSE 4
        END,
        final.bin_code ASC
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    return {
      status: true,
      data: rows
    }
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    }
  }
}

  // =========================
  // DETAIL BIN
  // =========================
  async stockBinDetail(req) {
    try {
        const { bin_id } = req.params;

        const rows = await db.sequelize.query(`
        SELECT
            ws.id AS stock_id,

            label.label_number,
            part.part_number,
            part.part_name,
            usr.email AS placed_by,

            COALESCE(pkg.capacity, 0) AS qty_per_kanban,

            ws.created_at AS placement_date

        FROM t_warehouse_stock ws
        JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
        JOIN t_part_labels label ON label.id = wil.label_id
        JOIN s_parts part ON part.id = label.part_id
        LEFT JOIN s_packages pkg ON pkg.id = part.package_id
        LEFT JOIN t_warehouse_stock_log place_log
          ON place_log.wh_stock_id = ws.id
          AND place_log.is_placement = true
        LEFT JOIN s_users usr
          ON usr.id = place_log.user_id

        WHERE ws.bin_id = :bin_id

        ORDER BY ws.created_at ASC
        `, {
        replacements: { bin_id },
        type: QueryTypes.SELECT
        });

        return {
        status: true,
        data: rows
        };

    } catch (error) {
        return {
        status: false,
        error: error.message,
        code: 500
        };
    }
    }

}

export default new StockMonitoringModule()