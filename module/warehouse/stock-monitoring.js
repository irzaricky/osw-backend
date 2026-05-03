import { Op, fn, col, literal } from 'sequelize'
import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import { QueryTypes } from 'sequelize';

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
            COALESCE(SUM(pkg.capacity), 0)::int AS total_pcs
        FROM t_warehouse_stock ws
        JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
        JOIN t_part_labels label ON label.id = wil.label_id
        JOIN s_parts part ON part.id = label.part_id
        LEFT JOIN s_packages pkg ON pkg.id = part.package_id
        `)

        const [binRows] = await db.sequelize.query(`
        SELECT
            COUNT(b.id)::int AS total_bins,
            COUNT(*) FILTER (
            WHERE COALESCE(stock.used_capacity, 0) > 0
            )::int AS occupied_bins_check,
            COUNT(*) FILTER (
            WHERE COALESCE(stock.used_capacity, 0) >= b.capacity
            )::int AS full_bins,
            COUNT(*) FILTER (
            WHERE COALESCE(stock.used_capacity, 0) = 0
            )::int AS empty_bins,
            COUNT(*) FILTER (
            WHERE COALESCE(stock.used_capacity, 0) >= (b.capacity * 0.8)
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
            low_capacity_bins: Number(binSummary.low_capacity_bins || 0)
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
        const rows = await db.sequelize.query(`
        SELECT
            part.id AS part_id,
            part.part_number,
            part.part_name,
            part.part_category,

            pkg.id AS package_id,
            pkg.package_code,
            pkg.name AS package_name,
            COALESCE(pkg.capacity, 0) AS capacity_per_kanban,

            COUNT(ws.id)::int AS total_kanban,
            (COUNT(ws.id) * COALESCE(pkg.capacity, 0))::int AS total_pcs,

            COUNT(DISTINCT ws.bin_id)::int AS total_bins,

            MIN(wsl.created_at) AS oldest_stock_at,
            MAX(wsl.created_at) AS latest_stock_at

        FROM t_warehouse_stock ws
        JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
        JOIN t_part_labels label ON label.id = wil.label_id
        JOIN s_parts part ON part.id = label.part_id
        LEFT JOIN s_packages pkg ON pkg.id = part.package_id
        LEFT JOIN t_warehouse_stock_log wsl 
            ON wsl.wh_stock_id = ws.id 
            AND wsl.is_placement = true

        GROUP BY
            part.id,
            part.part_number,
            part.part_name,
            part.part_category,
            pkg.id,
            pkg.package_code,
            pkg.name,
            pkg.capacity

        ORDER BY part.part_number ASC
        `, {
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

            COALESCE(pkg.capacity, 0) AS qty_per_kanban,

            ws.created_at AS placement_date

        FROM t_warehouse_stock ws
        JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
        JOIN t_part_labels label ON label.id = wil.label_id
        JOIN s_parts part ON part.id = label.part_id
        LEFT JOIN s_packages pkg ON pkg.id = part.package_id
        LEFT JOIN s_warehouse_bins b ON b.id = ws.bin_id
        LEFT JOIN s_warehouse_areas wa ON wa.id = b.area_id

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
        const rows = await db.sequelize.query(`
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
            WHEN COALESCE(stock.used_capacity, 0) = 0 THEN 'Empty'
            WHEN COALESCE(stock.used_capacity, 0) >= COALESCE(b.capacity, 0) THEN 'Full'
            ELSE 'Available'
            END AS status

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

        ORDER BY b.bin_code ASC
        `, {
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

            COALESCE(pkg.capacity, 0) AS qty_per_kanban,

            ws.created_at AS placement_date

        FROM t_warehouse_stock ws
        JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
        JOIN t_part_labels label ON label.id = wil.label_id
        JOIN s_parts part ON part.id = label.part_id
        LEFT JOIN s_packages pkg ON pkg.id = part.package_id

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