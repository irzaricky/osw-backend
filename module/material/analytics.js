import db from '../../models/index.js';
import { Op } from 'sequelize';
import dayjs from 'dayjs';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import { config } from '../../config/app.config.js';

const {
  SMrp, SMrpDetail,
  SMaterialPurchaseRequest, TMaterialPurchaseRequestDetail,
  SMaterialPurchaseOrder, TMaterialPurchaseOrderDetail, SSuppliers,
  SMaterialDeliveryOrder, TMaterialDeliveryOrderDetail,
  SDocks, SVehicles, RefVehicleType,
  SParts, SUom,
  sequelize
} = db;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNAL
//
// CATATAN PENTING: getWarehouseStockByParts() dan calcTotalWeight() di bawah
// ini adalah DUPLIKASI dari fungsi private (tidak di-export) yang ada di
// mrp.js dan mdo.js. File ini sengaja dibuat berdiri sendiri (terpisah dari
// 4 module CRUD) agar pengelolaannya lebih mudah — efek sampingnya, kalau
// logika perhitungan stok/berat di mrp.js atau mdo.js berubah di masa depan,
// salinan di sini PERLU disinkronkan manual. Alternatif supaya tidak
// duplikasi: export fungsi tersebut dari mrp.js/mdo.js lalu import di sini —
// tapi itu berarti menyentuh ulang file mrp.js/mdo.js, yang sepertinya
// justru ingin dihindari dengan pendekatan file terpisah ini.
// ─────────────────────────────────────────────────────────────────────────────

async function getWarehouseStockByParts(partIds) {
  if (!partIds || partIds.length === 0) return {};

  const rows = await sequelize.query(
    `
    SELECT
      pl.part_id,
      COALESCE(SUM(
        CASE WHEN wsl.is_placement = true
             THEN wsl.qty_per_kanban
             ELSE -wsl.qty_per_kanban
        END
      ), 0) AS stock_qty
    FROM t_warehouse_stock ws
    INNER JOIN t_warehouse_stock_log wsl
      ON wsl.wh_stock_id = ws.id
      AND wsl.deleted_at IS NULL
    INNER JOIN t_work_order_storing_item_label woil
      ON woil.id = ws.wo_item_label_id
      AND woil.deleted_at IS NULL
    INNER JOIN t_part_labels pl
      ON pl.id = woil.label_id
      AND pl.deleted_at IS NULL
    WHERE ws.deleted_at IS NULL
      AND pl.part_id IN (:partIds)
    GROUP BY pl.part_id
    `,
    {
      replacements: { partIds },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const stockMap = {};
  for (const row of rows) {
    stockMap[row.part_id] = parseFloat(row.stock_qty) || 0;
  }
  return stockMap;
}

/**
 * Hitung total berat dari array detail: [{ qty, part: { weight } }]
 * Sama seperti calcTotalWeight() di mdo.js — lihat catatan duplikasi di atas.
 */
function calcTotalWeight(details) {
  let total = 0;
  for (const d of details) {
    const w = parseFloat(d.part?.weight ?? 0);
    total += parseFloat(d.qty) * w;
  }
  return total;
}

function getDateRange(req) {
  const { start_date, end_date } = req.query;
  const startDateStr = start_date
    ? dayjs(start_date).format('YYYY-MM-DD')
    : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const endDateStr = end_date
    ? dayjs(end_date).format('YYYY-MM-DD')
    : dayjs().format('YYYY-MM-DD');
  return { startDateStr, endDateStr };
}

class MaterialAnalyticsModule extends BaseModule {
  /**
   * GET /material/analytics/mrp
   * Status & priority breakdown, tren bulanan, dan top 10 material shortage
   * (selisih qty kebutuhan vs stok gudang) untuk MRP Submitted/Approved.
   * Default rentang: 30 hari terakhir (filter berdasarkan created_at).
   */
  async getMrpAnalytics(req) {
    try {
      const { startDateStr, endDateStr } = getDateRange(req);

      const mrps = await SMrp.findAll({
        where: { created_at: { [Op.between]: [`${startDateStr} 00:00:00`, `${endDateStr} 23:59:59`] } },
        attributes: ['id', 'status', 'priority', 'created_at'],
        raw: true,
      });

      const status_breakdown = { Draft: 0, Submitted: 0, Approved: 0, Rejected: 0 };
      const priority_breakdown = { High: 0, Medium: 0, Low: 0 };
      const monthlyMap = {};

      for (const m of mrps) {
        if (status_breakdown[m.status] !== undefined) status_breakdown[m.status]++;
        if (m.priority && priority_breakdown[m.priority] !== undefined) priority_breakdown[m.priority]++;

        const month = dayjs(m.created_at).format('YYYY-MM');
        monthlyMap[month] = (monthlyMap[month] || 0) + 1;
      }

      const monthly_trend = Object.keys(monthlyMap)
        .sort()
        .map((month) => ({ month, count: monthlyMap[month] }));

      const total = mrps.length;
      const { Approved: approved, Rejected: rejected } = status_breakdown;
      const rejection_rate = (approved + rejected) > 0 ? helper.round((rejected / (approved + rejected)) * 100, 2) : 0;

      // NOTE: status string 'Submitted'/'Approved' harus tetap sinkron dengan
      // MRP_STATUS di mrp.js — di sana statusnya Capitalized (bukan lowercase).
      const relevantIds = mrps
        .filter((m) => m.status === 'Submitted' || m.status === 'Approved')
        .map((m) => m.id);

      let top_shortage_parts = [];
      if (relevantIds.length > 0) {
        const details = await SMrpDetail.findAll({
          where: { mrp_id: { [Op.in]: relevantIds } },
          attributes: ['part_id', 'qty'],
          include: [{ model: SParts, as: 'part', attributes: ['id', 'part_number', 'part_name'], include: [{ model: SUom, as: 'uom', attributes: ['code'] }] }],
        });

        const partIds = [...new Set(details.map((d) => d.part_id))];
        const stockMap = await getWarehouseStockByParts(partIds);

        const shortageMap = {};
        for (const d of details) {
          const stock = stockMap[d.part_id] || 0;
          const shortage = Math.max(0, parseFloat(d.qty) - stock);
          if (shortage <= 0) continue;

          if (!shortageMap[d.part_id]) {
            shortageMap[d.part_id] = {
              part_id: d.part_id,
              part_number: d.part?.part_number ?? null,
              part_name: d.part?.part_name ?? null,
              uom_code: d.part?.uom?.code ?? null,
              total_shortage_qty: 0,
            };
          }
          shortageMap[d.part_id].total_shortage_qty += shortage;
        }

        top_shortage_parts = Object.values(shortageMap)
          .sort((a, b) => b.total_shortage_qty - a.total_shortage_qty)
          .slice(0, 10);
      }

      return {
        status: true,
        data: {
          date_range: { start: startDateStr, end: endDateStr },
          kpis: { total, approved, rejected, rejection_rate },
          status_breakdown,
          priority_breakdown,
          monthly_trend,
          top_shortage_parts,
        },
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * GET /material/analytics/mpr
   * Status breakdown, rasio sumber (dari MRP vs manual/emergency), top
   * requested parts, dan tren bulanan. Filter berdasarkan request_date.
   */
  async getMprAnalytics(req) {
    try {
      const { startDateStr, endDateStr } = getDateRange(req);

      const mprs = await SMaterialPurchaseRequest.findAll({
        where: { request_date: { [Op.between]: [startDateStr, endDateStr] } },
        attributes: ['id', 'status', 'mrp_id', 'request_date'],
        raw: true,
      });

      const status_breakdown = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
      const monthlyMap = {};
      let from_mrp = 0;
      let manual = 0;

      for (const m of mprs) {
        if (status_breakdown[m.status] !== undefined) status_breakdown[m.status]++;
        if (m.mrp_id) from_mrp++; else manual++;

        const month = dayjs(m.request_date).format('YYYY-MM');
        monthlyMap[month] = (monthlyMap[month] || 0) + 1;
      }

      const monthly_trend = Object.keys(monthlyMap)
        .sort()
        .map((month) => ({ month, count: monthlyMap[month] }));

      const total = mprs.length;
      const { approved, rejected } = status_breakdown;
      const rejection_rate = (approved + rejected) > 0 ? helper.round((rejected / (approved + rejected)) * 100, 2) : 0;

      const mprIds = mprs.map((m) => m.id);
      let top_requested_parts = [];

      if (mprIds.length > 0) {
        const details = await TMaterialPurchaseRequestDetail.findAll({
          where: { mpr_id: { [Op.in]: mprIds } },
          attributes: ['part_id', 'qty'],
          include: [{ model: SParts, as: 'part', attributes: ['id', 'part_number', 'part_name'] }],
        });

        const partMap = {};
        for (const d of details) {
          if (!partMap[d.part_id]) {
            partMap[d.part_id] = {
              part_id: d.part_id,
              part_number: d.part?.part_number ?? null,
              part_name: d.part?.part_name ?? null,
              total_qty: 0,
            };
          }
          partMap[d.part_id].total_qty += parseFloat(d.qty || 0);
        }

        top_requested_parts = Object.values(partMap)
          .sort((a, b) => b.total_qty - a.total_qty)
          .slice(0, 10);
      }

      return {
        status: true,
        data: {
          date_range: { start: startDateStr, end: endDateStr },
          kpis: { total, approved, rejected, rejection_rate },
          status_breakdown,
          source_breakdown: { from_mrp, manual },
          top_requested_parts,
          monthly_trend,
        },
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * GET /material/analytics/mpo
   * Fokus SPEND (qty x price): total spend, avg order value, top supplier,
   * status breakdown, dan tren spend bulanan. Filter berdasarkan po_date.
   */
  async getMpoAnalytics(req) {
    try {
      const { startDateStr, endDateStr } = getDateRange(req);

      const mpos = await SMaterialPurchaseOrder.findAll({
        where: { po_date: { [Op.between]: [startDateStr, endDateStr] } },
        attributes: ['id', 'status', 'po_date', 'supplier_id'],
        include: [
          { model: SSuppliers, as: 'supplier', attributes: ['id', 'name'] },
          { model: TMaterialPurchaseOrderDetail, as: 'details', attributes: ['qty', 'price'] },
        ],
      });

      const status_breakdown = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
      const monthlyMap = {};
      const supplierMap = {};
      let total_spend = 0;

      for (const mpo of mpos) {
        const statusKey = (mpo.status || '').toLowerCase();
        if (status_breakdown[statusKey] !== undefined) status_breakdown[statusKey]++;

        const orderValue = (mpo.details || []).reduce(
          (sum, d) => sum + (parseFloat(d.qty) || 0) * (parseFloat(d.price) || 0),
          0
        );
        total_spend += orderValue;

        const month = dayjs(mpo.po_date).format('YYYY-MM');
        monthlyMap[month] = (monthlyMap[month] || 0) + orderValue;

        const suppId = mpo.supplier_id;
        if (!supplierMap[suppId]) {
          supplierMap[suppId] = {
            supplier_id: suppId,
            supplier_name: mpo.supplier?.name ?? null,
            total_spend: 0,
            order_count: 0,
          };
        }
        supplierMap[suppId].total_spend += orderValue;
        supplierMap[suppId].order_count++;
      }

      const monthly_spend_trend = Object.keys(monthlyMap)
        .sort()
        .map((month) => ({ month, spend: helper.round(monthlyMap[month], 2) }));

      const top_suppliers = Object.values(supplierMap)
        .map((s) => ({ ...s, total_spend: helper.round(s.total_spend, 2) }))
        .sort((a, b) => b.total_spend - a.total_spend)
        .slice(0, 10);

      const total = mpos.length;
      const { approved, rejected } = status_breakdown;
      const rejection_rate = (approved + rejected) > 0 ? helper.round((rejected / (approved + rejected)) * 100, 2) : 0;
      const avg_order_value = total > 0 ? helper.round(total_spend / total, 2) : 0;

      return {
        status: true,
        data: {
          date_range: { start: startDateStr, end: endDateStr },
          kpis: { total_orders: total, total_spend: helper.round(total_spend, 2), avg_order_value, rejection_rate },
          status_breakdown,
          top_suppliers,
          monthly_spend_trend,
        },
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * GET /material/analytics/mdo
   * Status breakdown, rata-rata capacity usage kendaraan, peringatan part
   * tanpa data berat, dock utilization (estimasi jam), dan vehicle leaderboard.
   * Filter berdasarkan target_date.
   */
  async getMdoAnalytics(req) {
    try {
      const { startDateStr, endDateStr } = getDateRange(req);

      const mdos = await SMaterialDeliveryOrder.findAll({
        where: { target_date: { [Op.between]: [startDateStr, endDateStr] } },
        include: [
          { model: SDocks, as: 'dock', attributes: ['id', 'name'] },
          {
            model: SVehicles,
            as: 'vehicle',
            attributes: ['id', 'vehicle_code', 'plate_number'],
            include: [{ model: RefVehicleType, as: 'vehicle_type', attributes: ['name', 'load_capacity'] }],
          },
          {
            model: TMaterialDeliveryOrderDetail,
            as: 'mdo_details',
            attributes: ['part_id', 'qty'],
            include: [{ model: SParts, as: 'part', attributes: ['id', 'weight'] }],
          },
        ],
      });

      const status_breakdown = { draft: 0, scheduled: 0, in_transit: 0, arrived: 0 };
      const dockMap = {};
      const vehicleMap = {};
      const missingWeightPartIds = new Set();
      let capacityPctSum = 0;
      let capacityPctCount = 0;

      for (const mdo of mdos) {
        const statusKey = (mdo.status || '').toLowerCase();
        if (status_breakdown[statusKey] !== undefined) status_breakdown[statusKey]++;

        const details = (mdo.mdo_details ?? []).map((d) => ({ qty: d.qty, part: d.part, part_id: d.part_id }));
        const total_weight_kg = calcTotalWeight(details);

        for (const d of details) {
          const w = d.part?.weight !== undefined && d.part?.weight !== null ? parseFloat(d.part.weight) : null;
          if (w === null || w <= 0) missingWeightPartIds.add(d.part_id);
        }

        const capacity = parseFloat(mdo.vehicle?.vehicle_type?.load_capacity ?? 0);
        if (capacity > 0) {
          capacityPctSum += (total_weight_kg / capacity) * 100;
          capacityPctCount++;
        }

        if (mdo.dock_id) {
          if (!dockMap[mdo.dock_id]) {
            dockMap[mdo.dock_id] = { dock_id: mdo.dock_id, dock_name: mdo.dock?.name ?? null, mdo_count: 0 };
          }
          dockMap[mdo.dock_id].mdo_count++;
        }

        if (mdo.vehicle_id) {
          if (!vehicleMap[mdo.vehicle_id]) {
            vehicleMap[mdo.vehicle_id] = {
              vehicle_id: mdo.vehicle_id,
              plate_number: mdo.vehicle?.plate_number ?? null,
              trip_count: 0,
              total_weight_kg: 0,
            };
          }
          vehicleMap[mdo.vehicle_id].trip_count++;
          vehicleMap[mdo.vehicle_id].total_weight_kg += total_weight_kg;
        }
      }

      // Estimasi jam okupansi — MDO tidak menyimpan durasi booking riil,
      // jadi ini cuma proksi (mdo_count x 0.5 jam, sesuai slot dock 30 menit).
      const dock_utilization = Object.values(dockMap)
        .map((d) => ({ ...d, estimated_hours: helper.round(d.mdo_count * 0.5, 1) }))
        .sort((a, b) => b.mdo_count - a.mdo_count);

      const vehicle_performance = Object.values(vehicleMap)
        .map((v) => ({ ...v, total_weight_kg: helper.round(v.total_weight_kg, 2) }))
        .sort((a, b) => b.trip_count - a.trip_count)
        .slice(0, 10);

      const total = mdos.length;
      const avg_capacity_usage_pct = capacityPctCount > 0 ? helper.round(capacityPctSum / capacityPctCount, 2) : 0;

      return {
        status: true,
        data: {
          date_range: { start: startDateStr, end: endDateStr },
          kpis: { total, avg_capacity_usage_pct, missing_weight_count: missingWeightPartIds.size },
          status_breakdown,
          dock_utilization,
          vehicle_performance,
        },
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }
}

export default new MaterialAnalyticsModule();