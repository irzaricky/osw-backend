import { Op } from "sequelize";
import Joi from "joi";
import db from "../../models/index.js";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";

const {
  SProductionPlan,
  SProductionPlanDetail,
  SProductionPlanDetailLine,
  SProductionPlanDoReference,
  SProductionPlanCapacityParam,
  SProductionPlanCapacityResult,
  SProductionPlanAdjustment,
  SDeliveryOrders,
  SDeliveryOrderDetails,
  SDeliveryPlanDetails,
  SSalesPurchaseOrderDetails,
  SCustomers,
  SParts,
  SLines,
  SUom,
  SLineCapacityParam,
  SStations,
  SStationJobs,
  SJobs,
  SPartRoutings,
  SPartRoutingDetails,
  sequelize,
} = db;

async function _calcLineCapacity({ plan_id, line_id, baseParam, adjustments, t }) {
  const fieldMap = {
    WORKING_DAYS:  'working_days',
    SHIFTS_PER_DAY:'shifts_per_day',
    WORKING_HOURS: 'working_hours_per_shift',
    MANPOWER:      'manpower',
    EFFICIENCY:    'efficiency_factor',
    OVERTIME:      'overtime_hours',
  };
 
  // ── 1. Terapkan adjustment di atas BASE param ─────────────────────────────
  const param = {
    working_days:            baseParam.working_days,
    shifts_per_day:          baseParam.shifts_per_day,
    working_hours_per_shift: parseFloat(baseParam.working_hours_per_shift),
    manpower:                baseParam.manpower,
    efficiency_factor:       parseFloat(baseParam.efficiency_factor),
    overtime_hours:          parseFloat(baseParam.overtime_hours ?? 0),
    max_takt_time:           baseParam.max_takt_time,
  };
  for (const adj of adjustments) {
    const field = fieldMap[adj.adjustment_type];
    if (field) param[field] = Number(adj.adjusted_value);
  }
 
  // ── 2. Guard: max_takt_time harus valid ──────────────────────────────────
  if (!param.max_takt_time || param.max_takt_time <= 0) {
    return { line_id, skipped: true, reason: 'max_takt_time is 0 or not set' };
  }
 
  // ── 3. Kalkulasi kapasitas (logic sama dengan calcCapacityUnits lama) ─────
  const { regular_minutes, overtime_minutes, available_minutes, total_cap_minutes, total_cap_units } =
    calcCapacityUnits(param);
 
  const max_takt_time_seconds = param.max_takt_time;
  const max_takt_time_minutes = max_takt_time_seconds / 60;
  const capacity_per_hour     = parseFloat((60 / max_takt_time_minutes).toFixed(4));
 
  // ── 4. Fetch station & job count ─────────────────────────────────────────
  const stationRows    = await SStations.findAll({ where: { line_id, status: true, deleted_at: null }, attributes: ['id'], transaction: t });
  const stationIds     = stationRows.map((r) => r.id);
  const total_stations = stationIds.length;
  const total_jobs     = total_stations > 0
    ? await SStationJobs.count({ where: { station_id: stationIds, active: true, deleted_at: null }, distinct: true, col: 'job_id', transaction: t })
    : 0;
 
  // ── 5. Ambil semua detail lines yang melewati lini ini (dalam plan ini) ──
  const assignedDetailLines = await SProductionPlanDetailLine.findAll({
    where:   { line_id },
    include: [{
      model:      SProductionPlanDetail,
      as:         'plan_detail',
      where:      { plan_id },
      attributes: ['id', 'part_id', 'qty_request'],
    }],
    transaction: t,
  });
 
  // ── 6. Hitung TOTAL demand di lini ini (aggregate, bukan per-detail) ─────
  //
  // FIX: Model shared-capacity yang benar.
  // Semua detail yang melewati lini ini BERBAGI kapasitas yang sama.
  // Feasibility = apakah total_cap_units >= TOTAL semua qty_request.
  //
  // Sebelumnya: min(qty_request, total_cap_units) per detail → selalu POSSIBLE
  //             jika qty_request < total_cap_units, meskipun aggregate melampaui.
  // Sekarang:   line_status = total_cap_units >= total_qty_this_line
  // ─────────────────────────────────────────────────────────────────────────
  let total_qty_this_line = 0;
  for (const dl of assignedDetailLines) {
    total_qty_this_line += dl.plan_detail.qty_request;
  }
 
  const line_status = total_cap_units >= total_qty_this_line ? 'POSSIBLE' : 'IMPOSSIBLE';
 
  // ── 7. Update setiap detail line — status mengikuti aggregate lini ────────
  for (const dl of assignedDetailLines) {
    const qty_request  = dl.plan_detail.qty_request;
    // qty_capacity: tetap min(qty, cap) agar UI bisa tampilkan
    // "lini ini mampu produksi sebanyak ini untuk detail ini jika berdiri sendiri"
    const ratio = total_qty_this_line > 0 
      ? Math.min(total_cap_units / total_qty_this_line, 1) 
      : 1;
    const qty_capacity = Math.floor(qty_request * ratio);
    // capacity_gap per detail: selisih aggregate (negatif = ada shortage di lini ini)
    // Ini memberi sinyal yang jujur ke planner bahwa ada kompetisi kapasitas.
    const capacity_gap  = total_cap_units - total_qty_this_line;
    await dl.update({ qty_capacity, capacity_gap, status: line_status }, { transaction: t });
  }
 
  // ── 8. Hitung menit ──────────────────────────────────────────────────────
  const effective_capacity_minutes = total_cap_minutes;
  const total_required_minutes     = parseFloat((total_qty_this_line * max_takt_time_minutes).toFixed(2));
  const capacity_gap_minutes       = parseFloat((effective_capacity_minutes - total_required_minutes).toFixed(2));
  const utilization_pct            = effective_capacity_minutes > 0
    ? parseFloat(((total_required_minutes / effective_capacity_minutes) * 100).toFixed(2))
    : 0;
 
  // ── 9. Upsert SProductionPlanCapacityResult ──────────────────────────────
  //
  // Tambahkan total_demand_on_line ke kolom yang disimpan agar UI/report
  // bisa menampilkan "kapasitas: 974, total permintaan: 1190, shortage: 216".
  // Jika kolom belum ada di schema, cukup simpan di capacity_gap_minutes
  // yang sudah ada — angka negatif sudah cukup informatif.
  // ─────────────────────────────────────────────────────────────────────────
  const [result, created] = await SProductionPlanCapacityResult.findOrCreate({
    where:    { plan_id, line_id },
    defaults: {
      plan_id, line_id, total_stations, total_jobs,
      max_takt_time: max_takt_time_seconds, capacity_per_hour,
      total_capacity_minutes:  parseFloat(effective_capacity_minutes.toFixed(2)),
      total_required_minutes,
      capacity_gap_minutes,
      utilization_pct,
      status:               line_status,
      total_capacity_units: total_cap_units,
      calculated_at:        new Date(),
      calculation_version:  1,
    },
    transaction: t,
  });
  if (!created) {
    await result.update({
      total_stations, total_jobs,
      max_takt_time: max_takt_time_seconds, capacity_per_hour,
      total_capacity_minutes:  parseFloat(effective_capacity_minutes.toFixed(2)),
      total_required_minutes,
      capacity_gap_minutes,
      utilization_pct,
      status:               line_status,
      total_capacity_units: total_cap_units,
      calculated_at:        new Date(),
      calculation_version:  (result.calculation_version ?? 0) + 1,
    }, { transaction: t });
  }
 
  return {
    line_id,
    skipped: false,
    line_status,
    total_cap_units,
    total_qty_this_line,
    total_required_minutes,
    effective_capacity_minutes: parseFloat(effective_capacity_minutes.toFixed(2)),
    capacity_gap_minutes,
    utilization_pct,
    capacity_info: {
      total_stations,
      total_jobs,
      max_takt_time_seconds,
      capacity_per_hour,
      regular_minutes:   parseFloat(regular_minutes.toFixed(2)),
      overtime_minutes:  parseFloat(overtime_minutes.toFixed(2)),
      available_minutes: parseFloat(available_minutes.toFixed(2)),
    },
  };
}

async function _aggregateOverallStatus({ plan_id, plan, allBaseParams, lineResults, t }) {
  // Cek apakah semua lini sudah terhitung (tidak ada yang skipped)
  const allLinesCalculated = allBaseParams
    .every((p) => lineResults.some((r) => r.line_id === p.line_id && !r.skipped));
 
  // Requery semua detail lines beserta status per-lini
  const finalDetailLines = await SProductionPlanDetailLine.findAll({
    include: [{
      model:      SProductionPlanDetail,
      as:         'plan_detail',
      where:      { plan_id },
      attributes: ['id', 'qty_request'],
    }],
    attributes: ['plan_detail_id', 'line_id', 'qty_capacity', 'status'],
    transaction: t,
  });
 
  // Agregasi per plan_detail_id: POSSIBLE hanya jika SEMUA lini POSSIBLE
  const detailAggMap = new Map();
  for (const dl of finalDetailLines) {
    const detail_id   = dl.plan_detail_id;
    const qty_request = dl.plan_detail.qty_request;
    if (!detailAggMap.has(detail_id)) {
      detailAggMap.set(detail_id, { qty_request, hasImpossible: false, hasUncalculated: false, minQtyCapacity: Infinity });
    }
    const entry = detailAggMap.get(detail_id);
    if (!dl.status || dl.status === 'Not_Calculated') {
      entry.hasUncalculated = true;
    } else {
      if (dl.status === 'IMPOSSIBLE') entry.hasImpossible = true;
      entry.minQtyCapacity = Math.min(entry.minQtyCapacity, dl.qty_capacity ?? 0);
    }
  }
 
  for (const [detail_id, { qty_request, hasImpossible, hasUncalculated, minQtyCapacity }] of detailAggMap.entries()) {
    if (hasUncalculated) {
      await SProductionPlanDetail.update({ status: 'Not_Calculated' }, { where: { id: detail_id }, transaction: t });
    } else {
      const effectiveCap = minQtyCapacity === Infinity ? 0 : minQtyCapacity;
      const gap          = effectiveCap - qty_request;
      const dstatus      = hasImpossible ? 'IMPOSSIBLE' : 'POSSIBLE';
      await SProductionPlanDetail.update(
        { qty_capacity: effectiveCap, capacity_gap: gap, status: dstatus },
        { where: { id: detail_id }, transaction: t }
      );
    }
  }
 
  let aggregatedStatus;
  if (!allLinesCalculated) {
    aggregatedStatus = 'Not_Calculated';
  } else {
    const hasBottleneck = [...detailAggMap.values()].some((e) => e.hasUncalculated || e.hasImpossible);
    aggregatedStatus = hasBottleneck ? 'IMPOSSIBLE' : 'POSSIBLE';
  }
 
  const total_qty_capacity = [...detailAggMap.values()].reduce((s, { qty_request, minQtyCapacity, hasUncalculated }) => {
    return s + (hasUncalculated ? 0 : Math.min(minQtyCapacity === Infinity ? 0 : minQtyCapacity, qty_request));
  }, 0);
 
  await plan.update({ total_qty_capacity, overall_status: aggregatedStatus }, { transaction: t });
 
  return { aggregatedStatus, total_qty_capacity, detailAggMap };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Derive rentang tanggal dari plan_month (string "YYYY-MM")
// ─────────────────────────────────────────────────────────────────────────────
function getPlanMonthRange(plan_month) {
  const [year, month] = plan_month.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end   = new Date(Date.UTC(year, month, 0));
  return {
    start,
    end,
    startStr: start.toISOString().split("T")[0],
    endStr:   end.toISOString().split("T")[0],
    year,
    month,
  };
}

function toDateStr(val) {
  if (!val) return "";
  if (typeof val === "string") return val.split("T")[0];
  return new Date(val).toISOString().split("T")[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Auto-assign lines dari routing per part
// Return: Map<part_id, [{ line_id, sequence }]>
// ─────────────────────────────────────────────────────────────────────────────
async function getRoutingLinesByPartIds(partIds, t) {
  if (!partIds.length) return new Map();

  const routings = await SPartRoutings.findAll({
    where:       { part_id: partIds, active: true, is_default: true },
    attributes:  ["id", "part_id"],
    include: [{
      model:      SPartRoutingDetails,
      as:         "routing_details",
      attributes: ["sequence", "station_id"],
      include: [{
        model:      SStations,
        as:         "station",
        attributes: ["line_id"],
        where:      { status: true, deleted_at: null },
      }],
    }],
    transaction: t,
  });

  const map = new Map();
  for (const routing of routings) {
    if (!map.has(routing.part_id)) map.set(routing.part_id, new Map());
    const lineSeqMap = map.get(routing.part_id);

    for (const rd of routing.routing_details) {
      const line_id = rd.station?.line_id;
      if (!line_id) continue;
      if (!lineSeqMap.has(line_id) || rd.sequence < lineSeqMap.get(line_id)) {
        lineSeqMap.set(line_id, rd.sequence);
      }
    }
  }

  const result = new Map();
  for (const [part_id, lineSeqMap] of map.entries()) {
    const sorted = [...lineSeqMap.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([line_id, sequence], idx) => ({ line_id, sequence: idx + 1 }));
    result.set(part_id, sorted);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Auto-assign detail lines + init BASE params
// ─────────────────────────────────────────────────────────────────────────────
async function autoAssignDetailLines(planId, details, routingMap, t, paramYear, paramMonth) {
  if (!details.length) return;

  const allLineIds = new Set();
  for (const detail of details) {
    const lines = routingMap.get(detail.part_id) ?? [];
    lines.forEach((l) => allLineIds.add(l.line_id));
  }

  if (allLineIds.size > 0) {
    const masterParamsAll = await SLineCapacityParam.findAll({
      where: {
        line_id: [...allLineIds],
        [Op.or]: [
          { param_year: { [Op.lt]: paramYear } },
          {
            param_year:  paramYear,
            param_month: { [Op.lte]: paramMonth },
          },
        ],
      },
      order: [
        ["line_id",    "ASC"],
        ["param_year", "DESC"],
        ["param_month","DESC"],
      ],
      transaction: t,
    });

    const masterMap = new Map();
    for (const m of masterParamsAll) {
      if (!masterMap.has(m.line_id)) masterMap.set(m.line_id, m);
    }

    const existingParams = await SProductionPlanCapacityParam.findAll({
      where:       { plan_id: planId, line_id: [...allLineIds], param_type: "BASE" },
      transaction: t,
    });
    const existingParamLineIds = new Set(existingParams.map((p) => p.line_id));

    const paramsToCreate = [];
    for (const line_id of allLineIds) {
      if (existingParamLineIds.has(line_id)) continue;
      const m = masterMap.get(line_id);
      if (!m) continue;
      paramsToCreate.push({
        plan_id:                 planId,
        line_id,
        param_type:              "BASE",
        working_days:            m.default_working_days,
        shifts_per_day:          m.default_shifts_per_day,
        working_hours_per_shift: m.default_working_hours_per_shift,
        manpower:                m.default_manpower,
        efficiency_factor:       m.default_efficiency_factor,
        overtime_hours:          m.default_overtime_hours,
        max_takt_time:           m.default_max_takt_time,
      });
    }
    if (paramsToCreate.length > 0) {
      await SProductionPlanCapacityParam.bulkCreate(paramsToCreate, { transaction: t });
    }
  }

  const rows = [];
  for (const detail of details) {
    const lines = routingMap.get(detail.part_id) ?? [];
    for (const { line_id, sequence } of lines) {
      rows.push({ plan_detail_id: detail.id, line_id, sequence, status: "Not_Calculated" });
    }
  }
  if (rows.length > 0) {
    await SProductionPlanDetailLine.bulkCreate(rows, { ignoreDuplicates: true, transaction: t });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: checkPlanLineConflicts — warning-only, tidak blocking
// ─────────────────────────────────────────────────────────────────────────────
async function checkPlanLineConflicts(currentPlanId, lineIds, t) {
  if (!lineIds || lineIds.length === 0) return [];

  const conflictingParams = await SProductionPlanCapacityParam.findAll({
    where: {
      line_id:    { [Op.in]: lineIds },
      param_type: "BASE",
      plan_id:    { [Op.ne]: currentPlanId },
    },
    include: [{
      model:      SProductionPlan,
      as:         "plan",
      where:      { status: { [Op.in]: ["Approved", "Pending_Approval"] } },
      attributes: ["id", "plan_number", "status", "earliest_delivery_date", "latest_delivery_date"],
      required:   true,
    }],
    attributes: ["plan_id", "line_id"],
    transaction: t,
  });

  if (!conflictingParams.length) return [];

  const conflictByLine = new Map();
  for (const cp of conflictingParams) {
    const lid = cp.line_id;
    if (!conflictByLine.has(lid)) conflictByLine.set(lid, []);
    conflictByLine.get(lid).push({
      plan_id:                cp.plan_id,
      plan_number:            cp.plan?.plan_number,
      status:                 cp.plan?.status,
      earliest_delivery_date: cp.plan?.earliest_delivery_date,
      latest_delivery_date:   cp.plan?.latest_delivery_date,
    });
  }

  const warnings = [];
  for (const [line_id, conflictingPlans] of conflictByLine.entries()) {
    warnings.push({
      line_id,
      message:           `Line ${line_id} juga digunakan oleh ${conflictingPlans.length} plan aktif lain (Approved/Pending_Approval). Kapasitas mungkin sudah terpakai sebagian.`,
      conflicting_plans: conflictingPlans,
    });
  }
  return warnings;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Hitung total_capacity_units dari param
//
// FIX: Manpower TIDAK mengalikan throughput unit.
// Rumus: total_capacity_units = floor(total_capacity_minutes / takt_time_minutes)
// ─────────────────────────────────────────────────────────────────────────────
function calcCapacityUnits(param) {
  const taktMin            = param.max_takt_time / 60;
  const regular_minutes    = param.working_days * param.shifts_per_day * param.working_hours_per_shift * 60;
  const overtime_minutes   = param.working_days * param.overtime_hours * 60;
  const available_minutes  = regular_minutes + overtime_minutes;
  const total_cap_minutes  = available_minutes * param.efficiency_factor;
  const total_cap_units    = taktMin > 0 ? Math.floor(total_cap_minutes / taktMin) : 0;
  return { regular_minutes, overtime_minutes, available_minutes, total_cap_minutes, total_cap_units };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Simulasi overlapping capacity
//
// Dalam model overlapping/transfer-batch, lini-lini pada routing suatu part
// tidak mengerjakan kuantitas yang dibagi, melainkan masing-masing mengerjakan
// PENUH qty_request (setiap unit melewati semua lini secara berurutan).
//
// Bottleneck sejati = lini dengan total_capacity_units TERKECIL dibandingkan
// qty_request. Dalam mode overlapping, tidak ada "gap" palsu akibat
// asumsi sequential start — lini hilir dapat mulai begitu ada unit dari lini hulu.
//
// Return: { overallStatus, totalCapByLine }
//   overallStatus: "POSSIBLE" jika semua lini mampu menampung qty_request
//   totalCapByLine: Map<line_id, { cap, qty, possible }>
// ─────────────────────────────────────────────────────────────────────────────
function simulateOverlappingFeasibility(detailLines, resultCapMap) {
  // Grup per plan_detail_id: cari bottleneck per detail
  // (lini dengan kapasitas terkecil = penentu feasibility)
  const detailFeasibility = new Map(); // detail_id → { qty_request, minLineCap, possible }

  for (const dl of detailLines) {
    const did     = dl.plan_detail_id;
    const cap     = resultCapMap.get(dl.line_id) ?? 0;
    const qty     = dl.plan_detail?.qty_request ?? 0;

    if (!detailFeasibility.has(did)) {
      detailFeasibility.set(did, { qty_request: qty, minLineCap: cap, possible: cap >= qty });
    } else {
      const entry = detailFeasibility.get(did);
      // Bottleneck = lini dengan kapasitas terkecil
      if (cap < entry.minLineCap) {
        entry.minLineCap = cap;
        entry.possible   = cap >= qty;
      }
    }
  }

  const allPossible = [...detailFeasibility.values()].every((e) => e.possible);
  return { overallStatus: allPossible ? "POSSIBLE" : "IMPOSSIBLE", detailFeasibility };
}

class PlanModule extends BaseModule {

  // ─────────────────────────────────────────────────────────────
  // LIST
  // ─────────────────────────────────────────────────────────────
  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      const { search = "", status, overall_status, plan_month, plan_type } = req.query;

      const where = {};
      if (search) {
        where[Op.or] = [
          { plan_number:      { [Op.iLike]: `%${search}%` } },
          { plan_description: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (status)         where.status         = status;
      if (overall_status) where.overall_status = overall_status;
      if (plan_month)     where.plan_month     = plan_month;
      if (plan_type)      where.plan_type      = plan_type;

      const { count, rows } = await SProductionPlan.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ["deleted_at"] },
        include: [{
          model:      SProductionPlan,
          as:         "parent_plan",
          attributes: ["id", "plan_number"],
          required:   false,
        }],
        order: [["plan_month", "DESC"], ["plan_type", "ASC"], ["created_at", "DESC"]],
      });

      return helper.sendResponse(res, {
        status: true,
        code:   200,
        data:   helper.getPaginationData(rows, count, page, limit),
      });
    } catch (error) {
      console.log(`[PlanModule][list]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DETAIL
  // ─────────────────────────────────────────────────────────────
  async detail(req, res) {
    try {
      const { id } = req.params;

      const plan = await SProductionPlan.findByPk(id, {
        include: [
          {
            model: SProductionPlanDetail,
            as:    "details",
            separate: true,
            include: [
              { model: SCustomers, as: "customer", attributes: ["id", "name"] },
              {
                model:      SParts,
                as:         "part",
                attributes: ["id", "part_number", "part_name"],
                include: [{ model: SUom, as: "uom", attributes: ["id", "name"] }],
              },
              {
                model:   SProductionPlanDetailLine,
                as:      "detail_lines",
                separate: true,
                include: [{ model: SLines, as: "line", attributes: ["id", "name"] }],
              },
            ],
          },
          {
            model:   SProductionPlanDoReference,
            as:      "do_references",
            separate: true,
            include: [{
              model:      SDeliveryOrders,
              as:         "delivery_order",
              attributes: ["id", "do_number", "shipment_date"],
            }],
          },
          {
            model:   SProductionPlanCapacityParam,
            as:      "capacity_params",
            separate: true,
            include: [{ model: SLines, as: "line", attributes: ["id", "name"] }],
          },
          {
            model:   SProductionPlanCapacityResult,
            as:      "capacity_results",
            separate: true,
            include: [{ model: SLines, as: "line", attributes: ["id", "name"] }],
          },
          {
            model:   SProductionPlanAdjustment,
            as:      "adjustments",
            separate: true,
            include: [{ model: SLines, as: "line", attributes: ["id", "name"] }],
          },
        ],
      });

      if (!plan) {
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }

      return helper.sendResponse(res, { status: true, code: 200, data: plan });
    } catch (error) {
      console.log(`[PlanModule][detail]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // GET AVAILABLE DELIVERY ORDERS
  // ─────────────────────────────────────────────────────────────
  async getAvailableDeliveryOrders(req, res) {
    try {
      const { plan_month } = req.query;

      if (!plan_month || !/^\d{4}-\d{2}$/.test(plan_month)) {
        return helper.sendResponse(res, {
          status: false,
          code:   400,
          error:  "Parameter plan_month wajib diisi dengan format YYYY-MM (contoh: 2025-05).",
        });
      }

      const { startStr, endStr } = getPlanMonthRange(plan_month);

      const allocated = await SProductionPlanDoReference.findAll({
        include: [{
          model:      SProductionPlan,
          as:         "plan",
          where:      { status: { [Op.notIn]: ["Rejected", "Cancelled"] } },
          attributes: [],
        }],
        attributes: ["do_id"],
      });
      const allocatedIds = allocated.map((r) => r.do_id);

      const dos = await SDeliveryOrders.findAll({
        where: {
          delivery_status: "Scheduled",
          shipment_date: {
            [Op.gte]: startStr,
            [Op.lte]: endStr,
          },
          ...(allocatedIds.length ? { id: { [Op.notIn]: allocatedIds } } : {}),
        },
        attributes: ["id", "do_number", "shipment_date", "customer_id"],
        include: [
          { model: SCustomers, as: "customer", attributes: ["id", "name"] },
          {
            model:      SDeliveryOrderDetails,
            as:         "details",
            attributes: ["id", "sent_qty", "received_qty"],
            include: [{
              model: SDeliveryPlanDetails,
              as:    "planDetail",
              include: [{
                model: SSalesPurchaseOrderDetails,
                as:    "spoDetail",
                include: [{
                  model:      SParts,
                  as:         "part",
                  attributes: ["id", "part_number", "part_name"],
                  include: [{ model: SUom, as: "uom", attributes: ["id", "name"] }],
                }],
              }],
            }],
          },
        ],
        order: [["shipment_date", "ASC"]],
      });

      return helper.sendResponse(res, {
        status: true,
        code:   200,
        data: {
          plan_month,
          period:          { start: startStr, end: endStr },
          delivery_orders: dos,
        },
      });
    } catch (error) {
      console.log(`[PlanModule][getAvailableDeliveryOrders]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CREATE — Mendukung plan_type: ORIGINAL | AMENDMENT
  // ─────────────────────────────────────────────────────────────
  async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const schema = Joi.object({
        plan_month:       Joi.string().pattern(/^\d{4}-\d{2}$/).required()
                            .messages({ "string.pattern.base": "plan_month harus format YYYY-MM (contoh: 2025-05)" }),
        plan_type:        Joi.string().valid("ORIGINAL", "AMENDMENT").default("ORIGINAL"),
        parent_plan_id:   Joi.number().integer().when("plan_type", {
          is:        "AMENDMENT",
          then:      Joi.required(),
          otherwise: Joi.forbidden(),
        }),
        plan_description: Joi.string().optional().allow("", null),
        do_ids:           Joi.array().items(Joi.number().integer()).min(1).required(),
        notes:            Joi.string().optional().allow("", null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { plan_month, plan_type, parent_plan_id, plan_description, do_ids, notes } = validation.value;
      const { startStr, endStr, year: paramYear, month: paramMonth } = getPlanMonthRange(plan_month);

      if (plan_type === "ORIGINAL") {
        const { year, month } = getPlanMonthRange(plan_month);
        const now          = new Date();
        const currentYear  = now.getUTCFullYear();
        const currentMonth = now.getUTCMonth() + 1;
        const monthsDiff   = (year - currentYear) * 12 + (month - currentMonth);

        if (monthsDiff < 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `Cannot create plan for (${plan_month}). Plan month cannot be in the past.`,
          });
        }
        if (monthsDiff > 3) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `Cannot create plan for (${plan_month}). Plan month cannot be more than 3 months in the future.`,
          });
        }

        const existingPlan = await SProductionPlan.findOne({
          where: { plan_month, plan_type: "ORIGINAL", status: { [Op.notIn]: ["Rejected", "Cancelled"] } },
          transaction: t,
        });
        if (existingPlan) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 409,
            error:  `Sudah ada Production Plan aktif untuk bulan ${plan_month} (${existingPlan.plan_number}). ` +
                    `Reject atau cancel plan tersebut sebelum membuat yang baru.`,
          });
        }
      }

      if (plan_type === "AMENDMENT") {
        const parentPlan = await SProductionPlan.findOne({
          where: { id: parent_plan_id, plan_month, plan_type: "ORIGINAL", status: "Approved" },
          transaction: t,
        });
        if (!parentPlan) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  `Parent plan tidak ditemukan atau belum Approved. Amendment hanya bisa dibuat jika ada ` +
                    `plan ORIGINAL bulan ${plan_month} yang sudah Approved.`,
          });
        }
      }

      const dos = await SDeliveryOrders.findAll({
        where: { id: { [Op.in]: do_ids }, delivery_status: "Scheduled" },
        attributes: ["id", "shipment_date", "customer_id"],
        include: [{
          model:      SDeliveryOrderDetails,
          as:         "details",
          attributes: ["id", "sent_qty", "delivery_plan_detail_id"],
          include: [{
            model:      SDeliveryPlanDetails,
            as:         "planDetail",
            attributes: ["id", "spo_detail_id", "planned_qty"],
            include: [{ model: SSalesPurchaseOrderDetails, as: "spoDetail", attributes: ["id", "part_id"] }],
          }],
        }],
        transaction: t,
      });

      if (dos.length !== do_ids.length) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "One or more Delivery Orders are invalid or not in Scheduled status",
        });
      }

      const invalidDos = dos.filter((d) => {
        const shipDate = toDateStr(d.shipment_date);
        return shipDate < startStr || shipDate > endStr;
      });
      if (invalidDos.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `${invalidDos.length} DO memiliki shipment_date di luar bulan ${plan_month}. ` +
                  `Semua DO harus memiliki shipment_date dalam rentang ${startStr} s/d ${endStr}.`,
          invalid_do_ids: invalidDos.map((d) => d.id),
        });
      }

      const isAmendment  = plan_type === "AMENDMENT";
      const prefix       = isAmendment ? `PP-${plan_month}-A` : `PP-${plan_month}-`;
      const lastPlan     = await SProductionPlan.findOne({
        where: { plan_number: { [Op.iLike]: `${prefix}%` } },
        order: [["plan_number", "DESC"]],
        paranoid: false, transaction: t,
      });
      const seq         = lastPlan
        ? String(parseInt(lastPlan.plan_number.split(isAmendment ? "-A" : "-").pop()) + 1).padStart(5, "0")
        : "00001";
      const plan_number = `${prefix}${seq}`;

      const allDates               = dos.map((d) => new Date(d.shipment_date));
      const earliest_delivery_date = new Date(Math.min(...allDates));
      const latest_delivery_date   = new Date(Math.max(...allDates));

      const resolvePartId = (dd) => dd.planDetail?.spoDetail?.part_id ?? null;
      const resolveQty    = (dd) => dd.sent_qty ?? 0;

      const total_qty_request = dos.reduce(
        (sum, d) => sum + d.details.reduce((s, dd) => s + resolveQty(dd), 0), 0
      );
      const unique_parts = new Set(
        dos.flatMap((d) => d.details.map(resolvePartId).filter(Boolean))
      );

      const plan = await SProductionPlan.create({
        plan_number,
        plan_month,
        plan_type,
        parent_plan_id: isAmendment ? parent_plan_id : null,
        plan_description,
        earliest_delivery_date,
        latest_delivery_date,
        total_products:    unique_parts.size,
        total_qty_request,
        overall_status:    "Not_Calculated",
        status:            "Draft",
        notes,
        created_by:        req.user?.id ?? null,
      }, { transaction: t });

      await SProductionPlanDoReference.bulkCreate(
        do_ids.map((do_id) => ({ plan_id: plan.id, do_id })),
        { transaction: t }
      );

      const detailMap = new Map();
      dos.forEach((doObj) => {
        doObj.details.forEach((dd) => {
          const part_id = resolvePartId(dd);
          if (!part_id) return;
          const delivery_date = doObj.shipment_date;
          const key           = `${doObj.customer_id}_${part_id}_${delivery_date}`;

          if (detailMap.has(key)) {
            detailMap.get(key).qty_request += resolveQty(dd);
          } else {
            detailMap.set(key, {
              plan_id:      plan.id,
              do_id:        doObj.id,
              do_detail_id: dd.id,
              customer_id:  doObj.customer_id,
              part_id,
              delivery_date,
              qty_request:  resolveQty(dd),
              status:       "Not_Calculated",
            });
          }
        });
      });

      const detailRows = Array.from(detailMap.values()).map((d, i) => ({ ...d, sequence: i + 1 }));
      const createdDetails = await SProductionPlanDetail.bulkCreate(detailRows, {
        returning: true, transaction: t,
      });

      const partIds    = [...new Set(createdDetails.map((d) => d.part_id))];
      const routingMap = await getRoutingLinesByPartIds(partIds, t);
      await autoAssignDetailLines(plan.id, createdDetails, routingMap, t, paramYear, paramMonth);

      const totalAssignedLines = [...routingMap.values()].reduce((s, v) => s + v.length, 0);
      const partsWithNoRouting = partIds.filter((pid) => !(routingMap.get(pid) ?? []).length);

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "CREATE",
        resourceId:   plan.id,
        newData:      plan,
        description:  `Created ${plan_type} Production Plan ${plan_number} for ${plan_month}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    201,
        message: "Production Plan created successfully",
        data: {
          id:                    plan.id,
          plan_number,
          plan_month,
          plan_type,
          parent_plan_id:        isAmendment ? parent_plan_id : null,
          period:                { start: startStr, end: endStr },
          total_detail_lines:    totalAssignedLines,
          parts_without_routing: partsWithNoRouting.length,
          warning: partsWithNoRouting.length > 0
            ? `${partsWithNoRouting.length} part(s) have no active default routing. Capacity cannot be calculated for those parts.`
            : null,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][create]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────
  async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema  = Joi.object({
        plan_description: Joi.string().optional().allow("", null),
        notes:            Joi.string().optional().allow("", null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (plan.status !== "Draft") {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Only Draft plans can be edited" });
      }

      const oldData = plan.toJSON();
      await plan.update(validation.value, { transaction: t });

      await this.logActivity(req, {
        moduleCode: "production-plan", activityCode: "UPDATE",
        resourceId: plan.id, oldData, newData: plan,
        description: `Updated Production Plan ${plan.plan_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: "Plan updated", data: plan });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][update]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SYNC DOs
  // ─────────────────────────────────────────────────────────────
  async syncDOs(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema = Joi.object({
        do_ids: Joi.array().items(Joi.number().integer()).min(1).required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { do_ids } = validation.value;

      const plan = await SProductionPlan.findByPk(id, {
        include: [{ model: SProductionPlanDoReference, as: "do_references" }],
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "Only Draft or Rejected plans can be synced",
        });
      }

      const { startStr, endStr, year: paramYear, month: paramMonth } = getPlanMonthRange(plan.plan_month);

      const currentDoIds = plan.do_references.map((r) => r.do_id);
      const toAdd        = do_ids.filter((did) => !currentDoIds.includes(did));
      const toRemove     = currentDoIds.filter((did) => !do_ids.includes(did));

      if (toRemove.length > 0) {
        const removedDetails = await SProductionPlanDetail.findAll({
          where:       { plan_id: id, do_id: toRemove },
          attributes:  ["id"],
          transaction: t,
        });
        const removedDetailIds = removedDetails.map((d) => d.id);
        if (removedDetailIds.length > 0) {
          await SProductionPlanDetailLine.destroy({
            where: { plan_detail_id: removedDetailIds }, transaction: t,
          });
        }
        await SProductionPlanDoReference.destroy({ where: { plan_id: id, do_id: toRemove }, transaction: t });
        await SProductionPlanDetail.destroy({ where: { plan_id: id, do_id: toRemove }, transaction: t });
      }

      let newDetails = [];
      if (toAdd.length > 0) {
        const dos = await SDeliveryOrders.findAll({
          where: { id: toAdd, delivery_status: "Scheduled" },
          attributes: ["id", "shipment_date", "customer_id"],
          include: [{
            model:      SDeliveryOrderDetails,
            as:         "details",
            attributes: ["id", "sent_qty"],
            include: [{
              model:      SDeliveryPlanDetails,
              as:         "planDetail",
              attributes: ["id", "spo_detail_id", "planned_qty"],
              include: [{ model: SSalesPurchaseOrderDetails, as: "spoDetail", attributes: ["id", "part_id"] }],
            }],
          }],
          transaction: t,
        });

        if (dos.length !== toAdd.length) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  "One or more Delivery Orders are invalid or not in Scheduled status",
          });
        }

        const invalidDos = dos.filter((d) => {
          const shipDate = toDateStr(d.shipment_date);
          return shipDate < startStr || shipDate > endStr;
        });
        if (invalidDos.length > 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status:         false,
            code:           400,
            error:          `${invalidDos.length} DO memiliki shipment_date di luar bulan ${plan.plan_month} ` +
                            `(${startStr} s/d ${endStr}). Hanya DO di bulan yang sama yang bisa ditambahkan.`,
            invalid_do_ids: invalidDos.map((d) => d.id),
          });
        }

        await SProductionPlanDoReference.bulkCreate(
          toAdd.map((do_id) => ({ plan_id: id, do_id })),
          { transaction: t }
        );

        const resolvePartId = (dd) => dd.planDetail?.spoDetail?.part_id ?? null;
        const resolveQty    = (dd) => dd.sent_qty ?? 0;

        const detailMap = new Map();
        dos.forEach((doObj) => {
          doObj.details.forEach((dd) => {
            const part_id = resolvePartId(dd);
            if (!part_id) return;
            const delivery_date = doObj.shipment_date;
            const key           = `${doObj.customer_id}_${part_id}_${delivery_date}`;

            if (detailMap.has(key)) {
              detailMap.get(key).qty_request += resolveQty(dd);
            } else {
              detailMap.set(key, {
                plan_id:      plan.id,
                do_id:        doObj.id,
                do_detail_id: dd.id,
                customer_id:  doObj.customer_id,
                part_id,
                delivery_date,
                qty_request:  resolveQty(dd),
                status:       "Not_Calculated",
              });
            }
          });
        });

        const lastDetail = await SProductionPlanDetail.findOne({
          where: { plan_id: id }, order: [["sequence", "DESC"]], transaction: t,
        });
        const startSeq = (lastDetail?.sequence ?? 0) + 1;

        const detailRows = Array.from(detailMap.values()).map((d, i) => ({ ...d, sequence: startSeq + i }));
        newDetails = await SProductionPlanDetail.bulkCreate(detailRows, { returning: true, transaction: t });
      }

      if (newDetails.length > 0) {
        const partIds    = [...new Set(newDetails.map((d) => d.part_id))];
        const routingMap = await getRoutingLinesByPartIds(partIds, t);
        await autoAssignDetailLines(plan.id, newDetails, routingMap, t, paramYear, paramMonth);
      }

      const updatedDetails = await SProductionPlanDetail.findAll({ where: { plan_id: id }, transaction: t });
      const total_qty_request = updatedDetails.reduce((s, d) => s + d.qty_request, 0);
      const unique_parts      = new Set(updatedDetails.map((d) => d.part_id));

      await plan.update({
        overall_status:     "Not_Calculated",
        total_qty_capacity: 0,
        total_products:     unique_parts.size,
        total_qty_request,
      }, { transaction: t });

      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: "Not_Calculated" },
        { where: { plan_id: id }, transaction: t }
      );

      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: "DOs synced and lines auto-assigned from routing",
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][syncDOs]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SAVE CAPACITY PARAMS
  // ─────────────────────────────────────────────────────────────
  async saveCapacityParams(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema = Joi.object({ line_id: Joi.number().integer().required() });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { line_id } = validation.value;

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "Capacity params can only be set on Draft or Rejected plans",
        });
      }

      const { year: paramYear, month: paramMonth } = getPlanMonthRange(plan.plan_month);

      const masterParams = await SLineCapacityParam.findOne({
        where: {
          line_id,
          [Op.or]: [
            { param_year: { [Op.lt]: paramYear } },
            { param_year: paramYear, param_month: { [Op.lte]: paramMonth } },
          ],
        },
        order: [["param_year", "DESC"], ["param_month", "DESC"]],
        transaction: t,
      });
      if (!masterParams) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 404,
          error:  `Line capacity params tidak ditemukan untuk periode ${plan.plan_month} atau sebelumnya. ` +
                  `Pastikan line capacity sudah dikalkulasi untuk periode tersebut.`,
        });
      }

      const [record, created] = await SProductionPlanCapacityParam.findOrCreate({
        where:    { plan_id: id, line_id, param_type: "BASE" },
        defaults: {
          plan_id:                 id,
          line_id,
          param_type:              "BASE",
          working_days:            masterParams.default_working_days,
          shifts_per_day:          masterParams.default_shifts_per_day,
          working_hours_per_shift: masterParams.default_working_hours_per_shift,
          manpower:                masterParams.default_manpower,
          efficiency_factor:       masterParams.default_efficiency_factor,
          overtime_hours:          masterParams.default_overtime_hours,
          max_takt_time:           masterParams.default_max_takt_time,
        },
        transaction: t,
      });

      if (!created) {
        await record.update({
          working_days:            masterParams.default_working_days,
          shifts_per_day:          masterParams.default_shifts_per_day,
          working_hours_per_shift: masterParams.default_working_hours_per_shift,
          manpower:                masterParams.default_manpower,
          efficiency_factor:       masterParams.default_efficiency_factor,
          overtime_hours:          masterParams.default_overtime_hours,
          max_takt_time:           masterParams.default_max_takt_time,
        }, { transaction: t });
      }

      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id, line_id }, transaction: t });

      await this.logActivity(req, {
        moduleCode: "production-plan", activityCode: "UPDATE",
        resourceId: plan.id, newData: record,
        description: `Reset BASE capacity params for line ${line_id} on plan ${plan.plan_number}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    created ? 201 : 200,
        message: created
          ? "BASE parameters created from line master"
          : "BASE parameters reset to line master defaults",
        data: record,
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][saveCapacityParams]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CALCULATE CAPACITY (per-line)
  //
  // Model Overlapping/Transfer-Batch:
  //   Setiap lini dalam routing mengerjakan SEMUA unit (bukan dibagi).
  //   Bottleneck = lini dengan kapasitas terkecil.
  //   Status IMPOSSIBLE hanya terjadi jika kapasitas lini < qty_request.
  //   TIDAK ada pinalti akibat asumsi sequential start.
  // ─────────────────────────────────────────────────────────────
  async calculateCapacity(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
   
      const schema = Joi.object({ line_id: Joi.number().integer().required() });
      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }
      const { line_id } = validation.value;
   
      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Plan not found' });
      }
      if (!['Draft', 'Rejected'].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Plan cannot be calculated in current status' });
      }
   
      const baseParam = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id, param_type: 'BASE' },
        transaction: t,
      });
      if (!baseParam) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'BASE parameters not found for this line. They should have been auto-created during plan creation. Please contact admin.',
        });
      }
   
      const adjustments = await SProductionPlanAdjustment.findAll({
        where:       { plan_id: id, line_id },
        order:       [['sequence', 'ASC']],
        transaction: t,
      });
   
      // ── Delegasi ke helper tunggal ────────────────────────────────────────
      const lineResult = await _calcLineCapacity({ plan_id: id, line_id, baseParam, adjustments, t });
   
      if (lineResult.skipped) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `max_takt_time is 0 or not set for line ${line_id}. Please reconfigure the line master capacity params.`,
        });
      }
   
      // ── Agregasi overall status ───────────────────────────────────────────
      const allBaseParams = await SProductionPlanCapacityParam.findAll({
        where: { plan_id: id, param_type: 'BASE' }, transaction: t,
      });
      const { aggregatedStatus } = await _aggregateOverallStatus({
        plan_id: id, plan, allBaseParams, lineResults: [lineResult], t,
      });
   
      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: `Capacity calculated for line ${line_id}. Overall plan status: ${aggregatedStatus}`,
        data: {
          line_id,
          overall_status:             aggregatedStatus,
          line_status:                lineResult.line_status,
          total_capacity_units:       lineResult.total_cap_units,
          total_qty_this_line:        lineResult.total_qty_this_line,
          total_required_minutes:     lineResult.total_required_minutes,
          effective_capacity_minutes: lineResult.effective_capacity_minutes,
          capacity_gap_minutes:       lineResult.capacity_gap_minutes,
          utilization_pct:            lineResult.utilization_pct,
          capacity_info:              lineResult.capacity_info,
          params_used:                {
            working_days:            baseParam.working_days,
            shifts_per_day:          baseParam.shifts_per_day,
            working_hours_per_shift: parseFloat(baseParam.working_hours_per_shift),
            efficiency_factor:       parseFloat(baseParam.efficiency_factor),
            overtime_hours:          parseFloat(baseParam.overtime_hours ?? 0),
            max_takt_time:           baseParam.max_takt_time,
          },
          adjustments_applied:        adjustments.length,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[PlanModule][calculateCapacity]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CALCULATE ALL CAPACITY
  // Kalkulasi semua line sekaligus dengan model overlapping.
  // ─────────────────────────────────────────────────────────────
  async calculateAllCapacity(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
   
      const plan = await SProductionPlan.findByPk(id, {
        include: [{ model: SProductionPlanDetail, as: 'details' }],
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Plan not found' });
      }
      if (!['Draft', 'Rejected'].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Plan cannot be calculated in current status' });
      }
   
      const allBaseParams = await SProductionPlanCapacityParam.findAll({
        where: { plan_id: id, param_type: 'BASE' }, transaction: t,
      });
      if (allBaseParams.length === 0) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'No BASE capacity parameters found for this plan.' });
      }
   
      const lineIds = allBaseParams.map((p) => p.line_id);
   
      // ── Reset semua detail lines & capacity results (sama seperti sebelumnya) ─
      const allDetailIds = plan.details.map((d) => d.id);
      if (allDetailIds.length > 0) {
        await SProductionPlanDetailLine.update(
          { qty_capacity: 0, capacity_gap: 0, status: 'Not_Calculated' },
          { where: { plan_detail_id: allDetailIds }, transaction: t }
        );
      }
      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });
   
      // ── Ambil semua adjustment sekaligus, grouped per line_id ────────────────
      const adjustmentsAll = await SProductionPlanAdjustment.findAll({
        where: { plan_id: id, line_id: lineIds },
        order: [['sequence', 'ASC']],
        transaction: t,
      });
      const adjByLine = new Map();
      for (const adj of adjustmentsAll) {
        if (!adjByLine.has(adj.line_id)) adjByLine.set(adj.line_id, []);
        adjByLine.get(adj.line_id).push(adj);
      }
   
      // ── Loop: satu panggilan _calcLineCapacity per lini ──────────────────────
      const lineResults = [];
      for (const bp of allBaseParams) {
        const result = await _calcLineCapacity({
          plan_id:     id,
          line_id:     bp.line_id,
          baseParam:   bp,
          adjustments: adjByLine.get(bp.line_id) ?? [],
          t,
        });
        lineResults.push(result);
      }
   
      // ── Agregasi overall status (helper yang sama dengan calculateCapacity) ───
      const { aggregatedStatus, total_qty_capacity } = await _aggregateOverallStatus({
        plan_id: id, plan, allBaseParams, lineResults, t,
      });
   
      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: `All ${lineResults.filter((r) => !r.skipped).length} line(s) calculated. Overall plan status: ${aggregatedStatus}`,
        data: {
          overall_status:    aggregatedStatus,
          total_qty_capacity,
          lines_calculated:  lineResults.filter((r) => !r.skipped).length,
          lines_skipped:     lineResults.filter((r) =>  r.skipped).length,
          calculation_order: lineIds,
          line_results:      lineResults.map((r) => ({
            line_id:              r.line_id,
            skipped:              r.skipped,
            reason:               r.reason,
            line_status:          r.line_status,
            total_capacity_units: r.total_cap_units,
            total_qty_this_line:  r.total_qty_this_line,
            utilization_pct:      r.utilization_pct,
            capacity_gap_minutes: r.capacity_gap_minutes,
          })),
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[PlanModule][calculateAllCapacity]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }
   
  // ─────────────────────────────────────────────────────────────
  // ADD ADJUSTMENT
  // ─────────────────────────────────────────────────────────────
  async addAdjustment(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        line_id:                Joi.number().integer().required(),
        adjustment_type:        Joi.string().valid(
          "WORKING_DAYS", "SHIFTS_PER_DAY", "WORKING_HOURS",
          "MANPOWER", "EFFICIENCY", "OVERTIME"
        ).required(),
        adjusted_value:         Joi.number().required(),
        adjustment_description: Joi.string().allow("", null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { line_id, adjustment_type, adjusted_value, adjustment_description } = validation.value;

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "Adjustments can only be added to Draft or Rejected plans",
        });
      }

      const base = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id, param_type: "BASE" }, transaction: t,
      });
      if (!base) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "BASE parameters not found for this line",
        });
      }

      const fieldMap = {
        WORKING_DAYS: "working_days", SHIFTS_PER_DAY: "shifts_per_day",
        WORKING_HOURS: "working_hours_per_shift", MANPOWER: "manpower",
        EFFICIENCY: "efficiency_factor", OVERTIME: "overtime_hours",
      };

      const fieldName  = fieldMap[adjustment_type];
      const base_value = Number(base[fieldName]);

      const lastAdj = await SProductionPlanAdjustment.findOne({
        where:    { plan_id: id, line_id },
        order:    [["sequence", "DESC"]],
        paranoid: false,
        transaction: t,
      });
      const sequence = lastAdj ? lastAdj.sequence + 1 : 1;

      const adj = await SProductionPlanAdjustment.create({
        plan_id: id, line_id, sequence,
        adjustment_type, adjustment_description,
        base_value, adjusted_value,
        difference: adjusted_value - base_value,
        created_by: req.user?.id ?? null,
      }, { transaction: t });

      // Reset hasil kalkulasi line ini sehingga perlu di-recalculate
      await SProductionPlanCapacityResult.update({
        status: "Not_Calculated", capacity_gap_minutes: null,
        utilization_pct: null, total_capacity_units: 0,
      }, { where: { plan_id: id, line_id }, transaction: t });

      const planDetailIdsForLine = await SProductionPlanDetailLine.findAll({
        where:       { line_id },
        include: [{
          model: SProductionPlanDetail, as: "plan_detail",
          where: { plan_id: id }, attributes: ["id"],
        }],
        attributes: ["id"],
        transaction: t,
      });
      const dlIdsForLine = planDetailIdsForLine.map((dl) => dl.id);
      if (dlIdsForLine.length > 0) {
        await SProductionPlanDetailLine.update(
          { qty_capacity: 0, capacity_gap: 0, status: "Not_Calculated" },
          { where: { id: dlIdsForLine }, transaction: t }
        );
      }

      await SProductionPlan.update(
        { overall_status: "Not_Calculated", total_qty_capacity: 0 },
        { where: { id }, transaction: t }
      );

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 201,
        message: "Adjustment saved. Run calculateCapacity again to apply.",
        data:    adj,
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][addAdjustment]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DELETE ADJUSTMENT
  // ─────────────────────────────────────────────────────────────
  async deleteAdjustment(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, adj_id } = req.params;

      const adj = await SProductionPlanAdjustment.findOne({
        where: { id: adj_id, plan_id: id }, transaction: t,
      });
      if (!adj) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Adjustment not found" });
      }

      const { line_id } = adj;
      await adj.destroy({ transaction: t });

      await SProductionPlanCapacityResult.update({
        status: "Not_Calculated", capacity_gap_minutes: null,
        utilization_pct: null, total_capacity_units: 0,
      }, { where: { plan_id: id, line_id }, transaction: t });

      const dlsForLine = await SProductionPlanDetailLine.findAll({
        where:       { line_id },
        include: [{
          model: SProductionPlanDetail, as: "plan_detail",
          where: { plan_id: id }, attributes: ["id"],
        }],
        attributes: ["id"],
        transaction: t,
      });
      const dlIdsForLine = dlsForLine.map((dl) => dl.id);
      if (dlIdsForLine.length > 0) {
        await SProductionPlanDetailLine.update(
          { qty_capacity: 0, capacity_gap: 0, status: "Not_Calculated" },
          { where: { id: dlIdsForLine }, transaction: t }
        );
      }

      await SProductionPlan.update(
        { overall_status: "Not_Calculated", total_qty_capacity: 0 },
        { where: { id }, transaction: t }
      );

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: "Adjustment deleted. Run calculateCapacity again to re-apply remaining adjustments.",
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][deleteAdjustment]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SUBMIT FOR APPROVAL
  //
  // FIX: Validasi IMPOSSIBLE tidak otomatis memblokir submit.
  // Dalam model overlapping, IMPOSSIBLE berarti kapasitas lini
  // tidak mencukupi — ini tetap di-submit untuk eskalasi manajerial.
  // Blocking hanya terjadi jika kapasitas BELUM dikalkulasi sama sekali.
  // ─────────────────────────────────────────────────────────────
  async submitForApproval(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const plan = await SProductionPlan.findByPk(id, {
        include: [{ model: SProductionPlanDetail, as: "details" }],
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "Only Draft or Rejected plans can be submitted",
        });
      }
      if (plan.overall_status === "Not_Calculated") {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "Capacity has not been calculated yet. Please run capacity calculation first.",
        });
      }

      // Validasi: semua detail harus punya minimal 1 detail line (ada routing)
      const detailIds = plan.details.map((d) => d.id);
      const detailLinesGrouped = await SProductionPlanDetailLine.findAll({
        where:      { plan_detail_id: detailIds },
        attributes: ["plan_detail_id"],
        transaction: t,
      });
      const detailIdsWithLines = new Set(detailLinesGrouped.map((dl) => dl.plan_detail_id));
      const unrouted = plan.details.filter((d) => !detailIdsWithLines.has(d.id));
      if (unrouted.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `${unrouted.length} product(s) have no routing configured. Please set up part routing first.`,
        });
      }

      // Validasi: semua line BASE params sudah dikalkulasi
      const params  = await SProductionPlanCapacityParam.findAll({ where: { plan_id: id, param_type: "BASE" }, transaction: t });
      const results = await SProductionPlanCapacityResult.findAll({ where: { plan_id: id }, transaction: t });

      const uncalculatedLines = params.filter((p) => !results.some((r) => r.line_id === p.line_id));
      if (uncalculatedLines.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `${uncalculatedLines.length} line(s) have not been calculated yet. Please run capacity calculation for all lines first.`,
        });
      }

      // OVERLAPPING MODEL: IMPOSSIBLE tidak memblokir submit.
      // Ini merupakan sinyal peringatan — perencana tetap bisa submit dengan
      // kapasitas yang kurang (misalnya dengan rencana lembur/outsource).
      // Catat warning dalam response jika IMPOSSIBLE.
      const hasImpossible = plan.overall_status === "IMPOSSIBLE";

      const oldData = plan.toJSON();
      await plan.update({ status: "Pending_Approval" }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "SUBMIT",
        resourceId:   plan.id,
        oldData,
        newData:      plan,
        description:  `Submitted Production Plan ${plan.plan_number} for approval` +
                      (hasImpossible ? " [WARNING: Some lines have insufficient capacity]" : ""),
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: "Production Plan submitted for approval",
        data: {
          id:             plan.id,
          plan_number:    plan.plan_number,
          status:         "Pending_Approval",
          overall_status: plan.overall_status,
          warning:        hasImpossible
            ? "Plan submitted with insufficient capacity on some lines. Approver should review before approving."
            : null,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][submitForApproval]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // APPROVE
  // ─────────────────────────────────────────────────────────────
  async approve(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema  = Joi.object({
        approval_notes: Joi.string().optional().allow("", null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (plan.status !== "Pending_Approval") {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Plan is not pending approval" });
      }

      const oldData = plan.toJSON();
      await plan.update({
        status:         "Approved",
        approved_by:    req.user?.id ?? null,
        approved_at:    new Date(),
        approval_notes: validation.value.approval_notes,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "APPROVE",
        resourceId:   plan.id,
        oldData,
        newData:      plan,
        description:  `Approved Production Plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: "Production Plan approved",
        data:    { id: plan.id, plan_number: plan.plan_number, status: "Approved" },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][approve]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // REJECT
  // ─────────────────────────────────────────────────────────────
  async reject(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema  = Joi.object({
        rejection_reason: Joi.string().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (plan.status !== "Pending_Approval") {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Plan is not pending approval" });
      }

      const oldData = plan.toJSON();
      await plan.update({
        status:           "Rejected",
        rejected_by:      req.user?.id ?? null,
        rejected_at:      new Date(),
        rejection_reason: validation.value.rejection_reason,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "REJECT",
        resourceId:   plan.id,
        oldData,
        newData:      plan,
        description:  `Rejected Production Plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: "Production Plan rejected",
        data:    { id: plan.id, plan_number: plan.plan_number, status: "Rejected" },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][reject]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────────────────
  async delete(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (plan.status !== "Draft") {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Only Draft plans can be deleted" });
      }

      const details = await SProductionPlanDetail.findAll({
        where:      { plan_id: id },
        attributes: ["id"],
        transaction: t,
      });
      const detailIds = details.map((d) => d.id);
      if (detailIds.length > 0) {
        await SProductionPlanDetailLine.destroy({
          where: { plan_detail_id: detailIds }, transaction: t,
        });
      }

      const oldData = plan.toJSON();
      await plan.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "DELETE",
        resourceId:   plan.id,
        oldData,
        description:  `Deleted Production Plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: "Production Plan deleted" });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][delete]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // GET DROPDOWN
  // ─────────────────────────────────────────────────────────────
  async getDropdown(req, res) {
    try {
      const plans = await SProductionPlan.findAll({
        where:      { status: "Approved", deleted_at: null },
        attributes: [
          "id", "plan_number", "plan_month",
          "plan_type", "parent_plan_id", "plan_description",
          "earliest_delivery_date", "latest_delivery_date",
        ],
        include: [{
          model:      SProductionPlan,
          as:         "parent_plan",
          attributes: ["id", "plan_number"],
          required:   false,
        }],
        order: [["plan_month", "DESC"], ["plan_type", "ASC"]],
      });
      return helper.sendResponse(res, { status: true, code: 200, data: plans });
    } catch (error) {
      console.log(`[PlanModule][getDropdown]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }
}

export default new PlanModule();
