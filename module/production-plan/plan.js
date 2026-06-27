import { Op } from "sequelize";
import Joi from "joi";
import db from "../../models/index.js";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";

const {
  SProductionPlan,
  SProductionPlanDetail,
  SProductionPlanCapacityParam,
  SProductionPlanCapacityResult,
  SProductionPlanCalendarAdjustment,
  SProductionOrder,
  SProductionOrderProduct,
  SDeliveryOrders,
  SDeliveryOrderDetails,
  SDeliveryPlanDetails,
  SSalesPurchaseOrderDetails,
  SCustomers,
  SParts,
  SLines,
  SUom,
  SLineCapacityParam,
  SPartRoutings,
  SShiftCalendars,
  RefTypeCalendars,
  SShifts,
  sequelize,
} = db;

// ─── DATE / RANGE HELPERS ────────────────────────────────────────────────────

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

// ─── CAPACITY CALCULATION ────────────────────────────────────────────────────
async function buildEffectiveParams(baseParam, plan_month, planId, t) {
  const { startStr, endStr } = getPlanMonthRange(plan_month);

  const shiftCalendars = await SShiftCalendars.findAll({
    where: {
      line_id: baseParam.line_id,
      active:  true,
      [Op.or]: [
        { start_date: { [Op.between]: [startStr, endStr] } },
        { end_date:   { [Op.between]: [startStr, endStr] } },
        {
          start_date: { [Op.lte]: startStr },
          end_date:   { [Op.gte]: endStr },
        },
      ],
    },
    include: [
      { model: RefTypeCalendars, as: "type_calendar", attributes: ["is_holiday"] },
      { model: SShifts,          as: "shift",         attributes: ["shift_number"] },
    ],
    transaction: t,
  });

  const adjustments = await SProductionPlanCalendarAdjustment.findAll({
    where:   { plan_id: planId },
    include: [{ model: SShifts, as: "shift", attributes: ["shift_number"], required: false }],
    transaction: t,
  });

  // ── Index master calendar per date: Set of active shift_number (empty if holiday or no row) ──
  const masterShiftsByDate = new Map(); // dateStr -> Set<shift_number>
  for (const entry of shiftCalendars) {
    if (entry.type_calendar?.is_holiday) continue;
    if (!entry.shift?.shift_number) continue;

    const entryStart = new Date(Math.max(new Date(entry.start_date), new Date(startStr)));
    const entryEnd   = new Date(Math.min(new Date(entry.end_date),   new Date(endStr)));

    for (let d = new Date(entryStart); d <= entryEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      if (!masterShiftsByDate.has(dateStr)) masterShiftsByDate.set(dateStr, new Set());
      masterShiftsByDate.get(dateStr).add(entry.shift.shift_number);
    }
  }

  // ── Index adjustments per date ──────────────────────────────────────────────
  // ADD_SHIFT covers both "holiday → working day" and "add extra shift on working day".
  const addShiftByDate      = new Map(); // dateStr -> Set<shift_number>
  const overtimeByDateShift = new Map(); // `${dateStr}|${shift_number}` -> total overtime_minutes
  let   total_overtime_minutes = 0;

  for (const adj of adjustments) {
    const shiftNumber = adj.shift?.shift_number ?? null;

    if (adj.adjustment_type === "ADD_SHIFT" && shiftNumber != null) {
      if (!addShiftByDate.has(adj.date)) addShiftByDate.set(adj.date, new Set());
      addShiftByDate.get(adj.date).add(shiftNumber);
    }
    if (adj.adjustment_type === "ADD_OVERTIME" && shiftNumber != null && adj.overtime_minutes) {
      const key = `${adj.date}|${shiftNumber}`;
      overtimeByDateShift.set(key, (overtimeByDateShift.get(key) ?? 0) + adj.overtime_minutes);
      total_overtime_minutes += adj.overtime_minutes;
    }
  }

  // ── Compute capacity day-by-day ────────────────────────────────────────────
  const taktMin    = baseParam.max_takt_time / 60;
  if (taktMin <= 0) {
    return {
      ...(baseParam.dataValues ?? baseParam),
      working_days: 0, shifts_per_day: 0,
      effective_total_cap_units: 0, effective_total_cap_minutes: 0,
    };
  }

  const regularMinPerShift = parseFloat(baseParam.working_hours_per_shift) * 60;
  const efficiency         = parseFloat(baseParam.efficiency_factor);

  let working_days      = 0;
  let max_shifts_in_day = 0;
  let total_cap_units   = 0;
  let total_cap_minutes = 0;

  for (let d = new Date(startStr); d <= new Date(endStr); d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];

    const activeShifts = new Set(masterShiftsByDate.get(dateStr) ?? []);
    if (addShiftByDate.has(dateStr)) {
      for (const sn of addShiftByDate.get(dateStr)) activeShifts.add(sn);
    }
    if (activeShifts.size === 0) continue;

    working_days      += 1;
    max_shifts_in_day  = Math.max(max_shifts_in_day, activeShifts.size);

    for (const shiftNumber of activeShifts) {
      const otMinutes        = overtimeByDateShift.get(`${dateStr}|${shiftNumber}`) ?? 0;
      const totalMinPerShift = regularMinPerShift + otMinutes;
      const effectiveMin     = totalMinPerShift * efficiency;

      total_cap_units   += Math.floor(effectiveMin / taktMin);
      total_cap_minutes += effectiveMin;
    }
  }

  return {
    ...(baseParam.dataValues ?? baseParam),
    working_days,
    shifts_per_day:              max_shifts_in_day,
    overtime_hours:              parseFloat((total_overtime_minutes / 60).toFixed(2)),
    effective_total_cap_units:   total_cap_units,
    effective_total_cap_minutes: parseFloat(total_cap_minutes.toFixed(2)),
    has_adjustments:             adjustments.length > 0,
  };
}

// ─── ROUTING HELPERS ─────────────────────────────────────────────────────────

async function getRoutingByPartIds(partIds, t) {
  if (!partIds.length) return new Map();

  const routings = await SPartRoutings.findAll({
    where:       { part_id: partIds, active: true, is_default: true },
    attributes:  ["id", "part_id", "line_id"],
    transaction: t,
  });

  const map = new Map();
  for (const r of routings) {
    if (!map.has(r.part_id)) {
      map.set(r.part_id, { routing_id: r.id, line_id: r.line_id });
    }
  }
  return map;
}

async function autoAssignDetails(planId, details, routingMap, t, paramYear, paramMonth) {
  if (!details.length) return;

  const assignedLineIds = new Set();
  const updateOps = [];

  for (const detail of details) {
    const routing = routingMap.get(detail.part_id);
    if (!routing) continue;
    updateOps.push(
      SProductionPlanDetail.update(
        { assigned_line_id: routing.line_id, routing_id: routing.routing_id },
        { where: { id: detail.id }, transaction: t }
      )
    );
    assignedLineIds.add(routing.line_id);
  }

  if (updateOps.length > 0) await Promise.all(updateOps);
  if (assignedLineIds.size === 0) return;

  const masterParamsAll = await SLineCapacityParam.findAll({
    where: {
      line_id: [...assignedLineIds],
      [Op.or]: [
        { param_year: { [Op.lt]: paramYear } },
        { param_year: paramYear, param_month: { [Op.lte]: paramMonth } },
      ],
    },
    order:       [["line_id", "ASC"], ["param_year", "DESC"], ["param_month", "DESC"]],
    transaction: t,
  });

  const masterMap = new Map();
  for (const m of masterParamsAll) {
    if (!masterMap.has(m.line_id)) masterMap.set(m.line_id, m);
  }

  const existingParams = await SProductionPlanCapacityParam.findAll({
    where:       { plan_id: planId, line_id: [...assignedLineIds] },
    transaction: t,
  });
  const existingParamLineIds = new Set(existingParams.map((p) => p.line_id));

  const paramsToCreate = [];
  for (const line_id of assignedLineIds) {
    if (existingParamLineIds.has(line_id)) continue;
    const m = masterMap.get(line_id);
    if (!m) continue;
    paramsToCreate.push({
      plan_id:                 planId,
      line_id,
      param_type:              "base",
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

// Proporsional allocation
function _allocateLineCapacityProportional(details, total_cap_units, total_qty_this_line) {
  if (!details.length) return [];

  if (total_qty_this_line <= 0) {
    return details.map((d) => ({ id: d.id, qty_capacity: 0, capacity_gap: 0, status: 'IMPOSSIBLE' }));
  }

  const raw = details.map((d) => {
    const exact = (d.qty_request / total_qty_this_line) * total_cap_units;
    return { id: d.id, qty_request: d.qty_request, exact, floor: Math.floor(exact) };
  });

  const allocatedFloor = raw.reduce((s, r) => s + r.floor, 0);
  const remainder       = Math.round(total_cap_units - allocatedFloor);

  // Sisa unit (akibat pembulatan ke bawah) diberikan ke detail dengan
  // pecahan desimal terbesar lebih dulu, supaya totalnya pas habis.
  const byFractionDesc = [...raw].sort(
    (a, b) => (b.exact - b.floor) - (a.exact - a.floor)
  );

  const finalQty = new Map(raw.map((r) => [r.id, r.floor]));
  for (let i = 0; i < remainder && i < byFractionDesc.length; i++) {
    const id = byFractionDesc[i].id;
    finalQty.set(id, finalQty.get(id) + 1);
  }

  return raw.map((r) => {
    const qty_capacity = finalQty.get(r.id);
    const capacity_gap  = qty_capacity - r.qty_request; // positif = surplus, negatif = kurang
    const status        = qty_capacity >= r.qty_request ? 'POSSIBLE' : 'IMPOSSIBLE';
    return { id: r.id, qty_capacity, capacity_gap, status };
  });
}

// ─── CAPACITY ENGINE ─────────────────────────────────────────────────────────
async function _calcLineCapacity({ plan_id, line_id, plan_month, plan, param, planId, t }) {
  if (!param.max_takt_time || param.max_takt_time <= 0) {
    return { line_id, skipped: true, reason: "max_takt_time is 0 or not set" };
  }

  const effective = await buildEffectiveParams(param, plan_month, planId, t);
  const total_cap_units_raw = effective.effective_total_cap_units;

  // Persist working_days, shifts_per_day, and overtime_hours derived from calendar.
  if (
    param.working_days    !== effective.working_days ||
    param.shifts_per_day  !== effective.shifts_per_day ||
    parseFloat(param.overtime_hours) !== effective.overtime_hours
  ) {
    await param.update(
      {
        working_days:   effective.working_days,
        shifts_per_day: effective.shifts_per_day,
        overtime_hours: effective.overtime_hours,
      },
      { transaction: t }
    );
  }

  let consumed_units = 0;
  if (plan?.plan_type === 'AMENDMENT' && plan?.parent_plan_id) {
    const releasedPOs = await SProductionOrder.findAll({
      where: {
        plan_id:    plan.parent_plan_id,
        status:     'Released',
        deleted_at: null,
      },
      attributes: ['id'],
      transaction: t,
    });

    if (releasedPOs.length > 0) {
      const releasedPoIds = releasedPOs.map((po) => po.id);
      const consumedSum   = await SProductionOrderProduct.sum('scheduled_qty', {
        where: {
          po_id:   { [Op.in]: releasedPoIds },
          line_id,
        },
        transaction: t,
      });
      consumed_units = consumedSum ?? 0;
    }
  }

  const total_cap_units = Math.max(0, total_cap_units_raw - consumed_units);

  const taktMin               = param.max_takt_time / 60;
  const capacity_per_hour     = parseFloat((60 / taktMin).toFixed(4));
  const max_takt_time_seconds = param.max_takt_time;

  const assignedDetails = await SProductionPlanDetail.findAll({
    where:       { plan_id, assigned_line_id: line_id },
    attributes:  ['id', 'qty_request'],
    transaction: t,
  });

  const total_qty_this_line = assignedDetails.reduce((s, d) => s + d.qty_request, 0);
  const line_status         = total_cap_units >= total_qty_this_line ? 'POSSIBLE' : 'IMPOSSIBLE';
  const capacity_gap_units  = total_cap_units - total_qty_this_line;

  const utilization_pct = total_cap_units > 0
    ? parseFloat(((total_qty_this_line / total_cap_units) * 100).toFixed(2))
    : 0;

  // ── Alokasi per detail: proporsional terhadap qty_request, kapasitas dibagi habis ──
  const allocations = _allocateLineCapacityProportional(assignedDetails, total_cap_units, total_qty_this_line);

  await Promise.all(
    allocations.map((a) =>
      SProductionPlanDetail.update(
        { qty_capacity: a.qty_capacity, capacity_gap: a.capacity_gap, status: a.status },
        { where: { id: a.id }, transaction: t }
      )
    )
  );

  const [result, created] = await SProductionPlanCapacityResult.findOrCreate({
    where:    { plan_id, line_id },
    defaults: {
      plan_id,
      line_id,
      max_takt_time:        max_takt_time_seconds,
      capacity_per_hour,
      capacity_gap_units,
      utilization_pct,
      status:               line_status,
      total_capacity_units: total_cap_units,
      calculated_at:        new Date(),
    },
    transaction: t,
  });

  if (!created) {
    await result.update({
      max_takt_time:        max_takt_time_seconds,
      capacity_per_hour,
      capacity_gap_units,
      utilization_pct,
      status:               line_status,
      total_capacity_units: total_cap_units,
      calculated_at:        new Date(),
    }, { transaction: t });
  }

  return {
    line_id,
    skipped: false,
    line_status,
    total_cap_units,
    total_cap_units_raw,
    consumed_units,
    total_qty_this_line,
    capacity_gap_units,
    utilization_pct,
    capacity_info: {
      max_takt_time_seconds,
      capacity_per_hour,
      effective_total_cap_units:   total_cap_units_raw,
      available_after_consumed:    total_cap_units,
      consumed_by_parent_plan:     consumed_units,
      has_calendar_adjustments:    effective.has_adjustments ?? false,
    },
  };
}

async function _aggregateOverallStatus({ plan_id, plan, allParams, lineResults, t }) {
  const freshResultMap = new Map(
    lineResults.filter((r) => !r.skipped).map((r) => [r.line_id, r.line_status])
  );

  const existingResults = await SProductionPlanCapacityResult.findAll({
    where:       { plan_id },
    attributes:  ["line_id", "status"],
    transaction: t,
  });
  const existingResultMap = new Map(existingResults.map((r) => [r.line_id, r.status]));

  const allLinesHaveResult = allParams.every(
    (p) => freshResultMap.has(p.line_id) || existingResultMap.has(p.line_id)
  );

  const allDetails = await SProductionPlanDetail.findAll({
    where:       { plan_id },
    attributes:  ["id", "qty_request", "assigned_line_id", "qty_capacity", "status"],
    transaction: t,
  });

  let aggregatedStatus;
  if (!allLinesHaveResult) {
    aggregatedStatus = "Not_Calculated";
  } else {
    const anyImpossible = allParams.some((p) => {
      const status = freshResultMap.get(p.line_id) ?? existingResultMap.get(p.line_id);
      return status === "IMPOSSIBLE";
    });
    aggregatedStatus = anyImpossible ? "IMPOSSIBLE" : "POSSIBLE";
  }

  const total_qty_capacity = allDetails.reduce((sum, d) => {
    if (!d.status || d.status === "Not_Calculated") return sum;
    const cap = d.qty_capacity ?? 0;
    return sum + Math.min(cap, d.qty_request);
  }, 0);

  await plan.update({ total_qty_capacity, overall_status: aggregatedStatus }, { transaction: t });

  return { aggregatedStatus, total_qty_capacity };
}

// ─── CONFLICT CHECK ──────────────────────────────────────────────────────────

async function checkPlanLineConflicts(currentPlanId, lineIds, t) {
  if (!lineIds?.length) return [];

  const conflictingParams = await SProductionPlanCapacityParam.findAll({
    where: {
      line_id: { [Op.in]: lineIds },
      plan_id: { [Op.ne]: currentPlanId },
    },
    include: [{
      model:      SProductionPlan,
      as:         "plan",
      where:      { status: { [Op.in]: ["Approved", "Pending_Approval"] } },
      attributes: ["id", "plan_number", "status", "earliest_delivery_date", "latest_delivery_date"],
      required:   true,
    }],
    attributes:  ["plan_id", "line_id"],
    transaction: t,
  });

  if (!conflictingParams.length) return [];

  const conflictByLine = new Map();
  for (const cp of conflictingParams) {
    if (!conflictByLine.has(cp.line_id)) conflictByLine.set(cp.line_id, []);
    conflictByLine.get(cp.line_id).push({
      plan_id:                cp.plan_id,
      plan_number:            cp.plan?.plan_number,
      status:                 cp.plan?.status,
      earliest_delivery_date: cp.plan?.earliest_delivery_date,
      latest_delivery_date:   cp.plan?.latest_delivery_date,
    });
  }

  return [...conflictByLine.entries()].map(([line_id, conflicting_plans]) => ({
    line_id,
    message: `Line ${line_id} is also used by ${conflicting_plans.length} other active plan(s) (Approved/Pending_Approval). Capacity may already be partially consumed.`,
    conflicting_plans,
  }));
}

// ─── SEQUENCE HELPER ─────────────────────────────────────────────────────────
// Menjaga `sequence` selalu selaras dengan delivery_date, agar alokasi
// FIFO/proporsional di _calcLineCapacity selalu memprioritaskan delivery_date
// paling awal — terlepas dari urutan DO ditambahkan/disinkronkan ke plan.
async function resequenceDetailsByDeliveryDate(planId, t) {
  const details = await SProductionPlanDetail.findAll({
    where:       { plan_id: planId },
    attributes:  ['id', 'delivery_date', 'sequence'],
    order:       [['delivery_date', 'ASC'], ['sequence', 'ASC'], ['id', 'ASC']],
    transaction: t,
  });

  await Promise.all(
    details.map((d, idx) => {
      const newSeq = idx + 1;
      if (d.sequence === newSeq) return null; // sudah sesuai, skip write
      return SProductionPlanDetail.update(
        { sequence: newSeq },
        { where: { id: d.id }, transaction: t }
      );
    })
  );
}

// ─── DO DETAIL RESOLVER ──────────────────────────────────────────────────────
function buildDetailRows({ dos, plan_id, startSeq = 1 }) {
  const detailMap = new Map();

  for (const doObj of dos) {
    for (const dd of doObj.details) {
      const part_id = dd.planDetail?.spoDetail?.part_id ?? null;
      if (!part_id) continue;

      const delivery_date = doObj.shipment_date;
      const key           = `${doObj.customer_id}_${part_id}_${delivery_date}`;

      if (detailMap.has(key)) {
        detailMap.get(key).qty_request += dd.sent_qty ?? 0;
      } else {
        detailMap.set(key, {
          plan_id,
          do_id:        doObj.id,
          do_detail_id: dd.id,
          customer_id:  doObj.customer_id,
          part_id,
          delivery_date,
          qty_request:  dd.sent_qty ?? 0,
          status:       "Not_Calculated",
        });
      }
    }
  }

  return Array.from(detailMap.values()).map((d, i) => ({ ...d, sequence: startSeq + i }));
}

async function fetchDosWithDetails(doIds, t) {
  return SDeliveryOrders.findAll({
    where:       { id: doIds, delivery_status: "Scheduled" },
    attributes:  ["id", "shipment_date", "customer_id"],
    include: [{
      model:      SDeliveryOrderDetails,
      as:         "details",
      attributes: ["id", "sent_qty", "delivery_plan_detail_id"],
      include: [{
        model:      SDeliveryPlanDetails,
        as:         "planDetail",
        attributes: ["id", "spo_detail_id", "planned_qty"],
        include:    [{ model: SSalesPurchaseOrderDetails, as: "spoDetail", attributes: ["id", "part_id"] }],
      }],
    }],
    order: [["shipment_date", "ASC"]],
    transaction: t,
  });
}

// working_days, shifts_per_day, overtime_hours are derived from the calendar on each calculateCapacity run.

// ─── MODULE ──────────────────────────────────────────────────────────────────

class PlanModule extends BaseModule {

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

      const planIds = rows.map((r) => r.id);
      const detailAggMap = new Map();

      if (planIds.length > 0) {
        const allDetails = await SProductionPlanDetail.findAll({
          where:      { plan_id: planIds },
          attributes: ["plan_id", "part_id", "qty_request"],
        });
        for (const d of allDetails) {
          if (!detailAggMap.has(d.plan_id)) {
            detailAggMap.set(d.plan_id, { parts: new Set(), total_qty: 0 });
          }
          const entry = detailAggMap.get(d.plan_id);
          entry.parts.add(d.part_id);
          entry.total_qty += d.qty_request;
        }
      }

      const data = rows.map((r) => {
        const agg = detailAggMap.get(r.id);
        return {
          ...r.toJSON(),
          total_products:    agg ? agg.parts.size : 0,
          total_qty_request: agg ? agg.total_qty  : 0,
        };
      });

      return helper.sendResponse(res, {
        status: true,
        code:   200,
        data:   helper.getPaginationData(data, count, page, limit),
      });
    } catch (error) {
      console.error("[PlanModule][list]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async detail(req, res) {
    try {
      const { id } = req.params;

      const plan = await SProductionPlan.findByPk(id, {
        include: [
          {
            model:    SProductionPlanDetail,
            as:       "details",
            separate: true,
            order:   [["delivery_date", "ASC"], ["sequence", "ASC"]],
            include: [
              { model: SDeliveryOrders, as: "delivery_order", attributes: ["id", "do_number", "shipment_date"] },
              { model: SCustomers,    as: "customer",      attributes: ["id", "name"] },
              {
                model:      SParts,
                as:         "part",
                attributes: ["id", "part_number", "part_name"],
                include:    [{ model: SUom, as: "uom", attributes: ["id", "name"] }],
              },
              { model: SLines,        as: "assigned_line", attributes: ["id", "name"] },
              { model: SPartRoutings, as: "routing",       attributes: ["id", "routing_code"] },
            ],
          },
          {
            model:    SProductionPlanCapacityParam,
            as:       "capacity_params",
            separate: true,
            include:  [{ model: SLines, as: "line", attributes: ["id", "name"] }],
          },
          {
            model:    SProductionPlanCapacityResult,
            as:       "capacity_results",
            separate: true,
            include:  [{ model: SLines, as: "line", attributes: ["id", "name"] }],
          },
          {
            model:    SProductionPlanCalendarAdjustment,
            as:       "calendar_adjustments",
            separate: true,
            include:  [{ model: SShifts, as: "shift", attributes: ["id", "name", "shift_number"], required: false }],
            order:    [["date", "ASC"]],
          },
        ],
      });

      if (!plan) {
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }

      const details           = plan.details ?? [];
      const total_products    = new Set(details.map((d) => d.part_id)).size;
      const total_qty_request = details.reduce((s, d) => s + d.qty_request, 0);

      return helper.sendResponse(res, {
        status: true,
        code:   200,
        data:   { ...plan.toJSON(), total_products, total_qty_request },
      });
    } catch (error) {
      console.error("[PlanModule][detail]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async getAvailableDeliveryOrders(req, res) {
    try {
      const { plan_month } = req.query;

      if (!plan_month || !/^\d{4}-\d{2}$/.test(plan_month)) {
        return helper.sendResponse(res, {
          status: false,
          code:   400,
          error:  "plan_month is required in YYYY-MM format (e.g. 2025-05)",
        });
      }

      const { startStr, endStr } = getPlanMonthRange(plan_month);

      const allocatedDetails = await SProductionPlanDetail.findAll({
        include: [{
          model:      SProductionPlan,
          as:         "plan",
          where:      { status: { [Op.notIn]: ["Rejected", "Cancelled"] } },
          attributes: [],
        }],
        attributes: ["do_id"],
      });
      const allocatedDoIds = [...new Set(allocatedDetails.map((r) => r.do_id))];

      const dos = await SDeliveryOrders.findAll({
        where: {
          delivery_status: "Scheduled",
          // shipment_date:   { [Op.between]: [startStr, endStr] },
          ...(allocatedDoIds.length ? { id: { [Op.notIn]: allocatedDoIds } } : {}),
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
                  include:    [{ model: SUom, as: "uom", attributes: ["id", "name"] }],
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
      console.error("[PlanModule][getAvailableDeliveryOrders]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const schema = Joi.object({
        plan_month:       Joi.string().pattern(/^\d{4}-\d{2}$/).required()
                            .messages({ "string.pattern.base": "plan_month must be in YYYY-MM format (e.g. 2025-05)" }),
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
        const monthsDiff   = (year - now.getUTCFullYear()) * 12 + (month - (now.getUTCMonth() + 1));

        if (monthsDiff < 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  `Cannot create plan for ${plan_month}. Plan month cannot be in the past.`,
          });
        }
        if (monthsDiff > 3) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  `Cannot create plan for ${plan_month}. Plan month cannot be more than 3 months in the future.`,
          });
        }

        const existingPlan = await SProductionPlan.findOne({
          where:       { plan_month, plan_type: "ORIGINAL", status: { [Op.notIn]: ["Rejected", "Cancelled"] } },
          transaction: t,
        });
        if (existingPlan) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 409,
            error:  `An active Production Plan already exists for ${plan_month} (${existingPlan.plan_number}). ` +
                    `Reject or cancel that plan before creating a new one.`,
          });
        }
      }

      if (plan_type === "AMENDMENT") {
        const parentPlan = await SProductionPlan.findOne({
          where:       { id: parent_plan_id, plan_month, plan_type: "ORIGINAL", status: "Approved" },
          transaction: t,
        });
        if (!parentPlan) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  `Parent plan not found or not yet Approved. Amendment can only be created when an ORIGINAL plan for ${plan_month} is Approved.`,
          });
        }

        const existingAmendment = await SProductionPlan.findOne({
          where:       { plan_month, plan_type: "AMENDMENT", status: { [Op.notIn]: ["Rejected", "Cancelled"] } },
          transaction: t,
        });
        if (existingAmendment) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 409,
            error:  `An active Amendment already exists for ${plan_month} (${existingAmendment.plan_number}).`,
          });
        }
      }

      const dos = await fetchDosWithDetails(do_ids, t);
      if (dos.length !== do_ids.length) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "One or more Delivery Orders are invalid or not in Scheduled status",
        });
      }

      // const invalidDos = dos.filter((d) => {
      //   const shipDate = toDateStr(d.shipment_date);
      //   return shipDate < startStr || shipDate > endStr;
      // });
      // if (invalidDos.length > 0) {
      //   await t.rollback();
      //   return helper.sendResponse(res, {
      //     status:         false, code: 400,
      //     error:          `${invalidDos.length} DO(s) have a shipment_date outside ${plan_month} (${startStr} – ${endStr}).`,
      //     invalid_do_ids: invalidDos.map((d) => d.id),
      //   });
      // }

      const isAmendment = plan_type === "AMENDMENT";
      const prefix      = isAmendment ? `PP-${plan_month}-A` : `PP-${plan_month}-`;
      const lastPlan    = await SProductionPlan.findOne({
        where:    { plan_number: { [Op.iLike]: `${prefix}%` } },
        order:    [["plan_number", "DESC"]],
        paranoid: false,
        transaction: t,
        lock:     t.LOCK.UPDATE,
      });
      const seq         = lastPlan
        ? String(parseInt(lastPlan.plan_number.split(isAmendment ? "-A" : "-").pop()) + 1).padStart(5, "0")
        : "00001";
      const plan_number = `${prefix}${seq}`;

      const allDates               = dos.map((d) => new Date(d.shipment_date));
      const earliest_delivery_date = new Date(Math.min(...allDates));
      const latest_delivery_date   = new Date(Math.max(...allDates));

      const plan = await SProductionPlan.create({
        plan_number,
        plan_month,
        plan_type,
        parent_plan_id: isAmendment ? parent_plan_id : null,
        plan_description,
        earliest_delivery_date,
        latest_delivery_date,
        overall_status: "Not_Calculated",
        status:         "Draft",
        notes,
        created_by:     req.user?.id ?? null,
      }, { transaction: t });

      const detailRows     = buildDetailRows({ dos, plan_id: plan.id });
      const createdDetails = await SProductionPlanDetail.bulkCreate(detailRows, { returning: true, transaction: t });

      const partIds    = [...new Set(createdDetails.map((d) => d.part_id))];
      const routingMap = await getRoutingByPartIds(partIds, t);
      await autoAssignDetails(plan.id, createdDetails, routingMap, t, paramYear, paramMonth);

      // Inherit calendar adjustments from original plan for amendments
      if (isAmendment) {
        const parentAdjustments = await SProductionPlanCalendarAdjustment.findAll({
          where: { plan_id: parent_plan_id },
        });
        if (parentAdjustments.length > 0) {
          await SProductionPlanCalendarAdjustment.bulkCreate(
            parentAdjustments.map((a) => ({
              plan_id:            plan.id,
              date:               a.date,
              adjustment_type:    a.adjustment_type,
              shift_id:           a.shift_id,
              overtime_minutes:   a.overtime_minutes,
              reason:             a.reason,
              inherited_from_plan: parent_plan_id,
            })),
            { transaction: t }
          );
        }
      }

      const partsWithNoRouting = partIds.filter((pid) => !routingMap.has(pid));

      // Check for line conflicts across active plans
      const assignedLineIds = [...new Set(
        createdDetails.map((d) => routingMap.get(d.part_id)?.line_id).filter(Boolean)
      )];
      const lineConflicts = await checkPlanLineConflicts(plan.id, assignedLineIds, t);

      const total_products    = new Set(createdDetails.map((d) => d.part_id)).size;
      const total_qty_request = createdDetails.reduce((s, d) => s + d.qty_request, 0);

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
          total_products,
          total_qty_request,
          parts_without_routing: partsWithNoRouting.length,
          warning: partsWithNoRouting.length > 0
            ? `${partsWithNoRouting.length} part(s) have no active default routing. Capacity cannot be calculated for those parts.`
            : null,
          line_conflicts: lineConflicts.length > 0 ? lineConflicts : null,
        },
      });
    } catch (error) {
      await t.rollback();
      console.error("[PlanModule][create]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id }   = req.params;
      const schema   = Joi.object({
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
        moduleCode:   "production-plan",
        activityCode: "UPDATE",
        resourceId:   plan.id,
        oldData,
        newData:      plan,
        description:  `Updated Production Plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: "Production Plan updated", data: plan });
    } catch (error) {
      await t.rollback();
      console.error("[PlanModule][update]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async syncDOs(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id }   = req.params;
      const schema   = Joi.object({
        do_ids: Joi.array().items(Joi.number().integer()).min(1).required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { do_ids } = validation.value;

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Only Draft or Rejected plans can be synced" });
      }

      const { startStr, endStr, year: paramYear, month: paramMonth } = getPlanMonthRange(plan.plan_month);

      const currentDetails = await SProductionPlanDetail.findAll({
        where:       { plan_id: id },
        attributes:  ["id", "do_id"],
        transaction: t,
      });
      const currentDoIds = [...new Set(currentDetails.map((d) => d.do_id))];
      const toAdd        = do_ids.filter((did) => !currentDoIds.includes(did));
      const toRemove     = currentDoIds.filter((did) => !do_ids.includes(did));

      if (toRemove.length > 0) {
        const detailIdsToRemove = currentDetails
          .filter((d) => toRemove.includes(d.do_id))
          .map((d) => d.id);

        if (detailIdsToRemove.length > 0) {
          await SProductionPlanDetail.destroy({ where: { id: detailIdsToRemove }, transaction: t, force: true });
        }

        const remainingDetails = await SProductionPlanDetail.findAll({
          where:       { plan_id: id },
          attributes:  ["assigned_line_id"],
          transaction: t,
        });
        const activeLineIds = [...new Set(remainingDetails.map((d) => d.assigned_line_id).filter(Boolean))];

        if (activeLineIds.length > 0) {
          await SProductionPlanCapacityParam.destroy({
            where: { plan_id: id, line_id: { [Op.notIn]: activeLineIds } }, transaction: t,
          });
          await SProductionPlanCapacityResult.destroy({
            where: { plan_id: id, line_id: { [Op.notIn]: activeLineIds } }, transaction: t,
          });
        } else {
          await SProductionPlanCapacityParam.destroy({ where: { plan_id: id }, transaction: t });
          await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });
        }
      }

      let newDetails = [];
      if (toAdd.length > 0) {
        const dos = await fetchDosWithDetails(toAdd, t);
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
            status:         false, code: 400,
            error:          `${invalidDos.length} DO(s) have a shipment_date outside ${plan.plan_month} (${startStr} – ${endStr}).`,
            invalid_do_ids: invalidDos.map((d) => d.id),
          });
        }

        const lastDetail = await SProductionPlanDetail.findOne({
          where: { plan_id: id }, order: [["sequence", "DESC"]], transaction: t,
        });
        const startSeq = (lastDetail?.sequence ?? 0) + 1;

        const detailRows = buildDetailRows({ dos, plan_id: plan.id, startSeq });
        newDetails = await SProductionPlanDetail.bulkCreate(detailRows, { returning: true, transaction: t });
      }

      if (newDetails.length > 0) {
        const partIds    = [...new Set(newDetails.map((d) => d.part_id))];
        const routingMap = await getRoutingByPartIds(partIds, t);
        await autoAssignDetails(plan.id, newDetails, routingMap, t, paramYear, paramMonth);
      }

      // Re-sequence SEMUA detail aktif berdasarkan delivery_date, supaya
      // delivery_date lebih awal selalu mendapat sequence lebih awal —
      // ini menjadi acuan urutan FIFO/proporsional di _calcLineCapacity.
      if (toAdd.length > 0 || toRemove.length > 0) {
        await resequenceDetailsByDeliveryDate(plan.id, t);
      }

      // Reset calculation state
      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: "Not_Calculated" },
        { where: { plan_id: id }, transaction: t }
      );
      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });
      await plan.update({ overall_status: "Not_Calculated", total_qty_capacity: 0 }, { transaction: t });

      // Recalculate earliest & latest delivery date dari detail yang masih aktif
      const activeDetails = await SProductionPlanDetail.findAll({
        where:       { plan_id: id, deleted_at: null },
        attributes:  ['delivery_date'],
        transaction: t,
      });

      if (activeDetails.length > 0) {
        const dates            = activeDetails.map(d => d.delivery_date).filter(Boolean).sort();
        const earliestDelivery = dates[0];
        const latestDelivery   = dates[dates.length - 1];

        await plan.update(
          { earliest_delivery_date: earliestDelivery, latest_delivery_date: latestDelivery },
          { transaction: t }
        );
      } else {
        await plan.update(
          { earliest_delivery_date: null, latest_delivery_date: null },
          { transaction: t }
        );
      }

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "UPDATE",
        resourceId:   plan.id,
        newData:      plan,
        description:  `Synced DOs for Production Plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: "Delivery Orders synced and lines auto-assigned from routing",
      });
    } catch (error) {
      await t.rollback();
      console.error("[PlanModule][syncDOs]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async getCalendarPreview(req, res) {
    try {
      const { id } = req.params;
  
      // 1. Load plan with details to get assigned line IDs
      const plan = await SProductionPlan.findByPk(id, {
        attributes: ["id", "plan_number", "plan_month", "status"],
        include: [
          {
            model: SProductionPlanDetail,
            as: "details",
            attributes: ["assigned_line_id"],
            where: { assigned_line_id: { [Op.ne]: null } },
            required: false,
          },
        ],
      });
  
      if (!plan) {
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
  
      // 2. Collect unique line_ids from plan details
      const lineIds = [
        ...new Set(
          (plan.details ?? [])
            .map((d) => d.assigned_line_id)
            .filter(Boolean)
        ),
      ];
  
      const { startStr, endStr } = getPlanMonthRange(plan.plan_month);
  
      // 3. Query shift calendars — filter by line_id if present, otherwise all lines
      const shiftCalendarWhere = {
        active: true,
        [Op.or]: [
          { start_date: { [Op.between]: [startStr, endStr] } },
          { end_date:   { [Op.between]: [startStr, endStr] } },
          { start_date: { [Op.lte]: startStr }, end_date: { [Op.gte]: endStr } },
        ],
      };
  
      if (lineIds.length > 0) {
        shiftCalendarWhere.line_id = { [Op.in]: lineIds };
      }
  
      const shiftCalendars = await SShiftCalendars.findAll({
        where: shiftCalendarWhere,
        include: [
          { model: RefTypeCalendars, as: "type_calendar", attributes: ["code", "name", "is_holiday"] },
          { model: SShifts,          as: "shift",          attributes: ["id", "name", "shift_number"] },
        ],
        order: [["start_date", "ASC"]],
      });
  
      // 4. Load calendar adjustments for this plan
      const adjustments = await SProductionPlanCalendarAdjustment.findAll({
        where:   { plan_id: id },
        include: [{ model: SShifts, as: "shift", attributes: ["id", "name", "shift_number"], required: false }],
        order:   [["date", "ASC"]],
      });
  
      // 5. Build per-date calendar view (WORKING_DAY / HOLIDAY / UNINITIALIZED)
      const dateMap = new Map();
      for (let d = new Date(startStr); d <= new Date(endStr); d.setUTCDate(d.getUTCDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        dateMap.set(dateStr, {
          date:          dateStr,
          base_shifts:   [],
          is_holiday:    false,
          master_status: "UNINITIALIZED",
          adjustments:   [],
        });
      }

      for (const entry of shiftCalendars) {
        const entryStart = new Date(Math.max(new Date(entry.start_date), new Date(startStr)));
        const entryEnd   = new Date(Math.min(new Date(entry.end_date),   new Date(endStr)));
        for (let d = new Date(entryStart); d <= entryEnd; d.setUTCDate(d.getUTCDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          const cell    = dateMap.get(dateStr);
          if (!cell) continue;
          if (entry.type_calendar?.is_holiday) {
            cell.is_holiday    = true;
            cell.master_status = "HOLIDAY";
          } else {
            cell.master_status = "WORKING_DAY";
            cell.base_shifts.push({
              shift_id:   entry.shift_id,
              shift:      entry.shift,
              line_id:    entry.line_id,
              date_event: entry.date_event,
            });
          }
        }
      }
  
      for (const adj of adjustments) {
        const cell = dateMap.get(adj.date);
        if (cell) cell.adjustments.push(adj);
      }
  
      return helper.sendResponse(res, {
        status: true,
        code:   200,
        data: {
          plan_id:    id,
          plan_month: plan.plan_month,
          line_ids:   lineIds,
          period:     { start: startStr, end: endStr },
          calendar:   [...dateMap.values()],
        },
      });
    } catch (error) {
      console.error("[PlanModule][getCalendarPreview]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async addCalendarAdjustment(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
  
      const shiftSchema = Joi.object({
        shift_number:     Joi.number().integer().min(1).max(3).required(),
        overtime_minutes: Joi.number().integer().min(1).max(120).optional().allow(null),
      });
  
      const schema = Joi.object({
        date:   Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
        shifts: Joi.array().items(shiftSchema).min(1).max(3).required(),
      });
  
      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }
  
      const { date, shifts: shiftInputs } = validation.value;
  
      // Validate duplicate shift_number within payload
      const inputShiftNumbers = shiftInputs.map(s => s.shift_number);
      if (new Set(inputShiftNumbers).size !== inputShiftNumbers.length) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Duplicate shift_number dalam satu request tidak diizinkan',
        });
      }
  
      // Load plan
      const plan = await SProductionPlan.findByPk(id, {
        include: [{ model: SProductionPlanDetail, as: 'details', attributes: ['assigned_line_id'], required: false }],
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Plan not found' });
      }
      if (!['Draft', 'Rejected'].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Calendar adjustments can only be added to Draft or Rejected plans',
        });
      }
  
      const { startStr, endStr } = getPlanMonthRange(plan.plan_month);
      if (date < startStr || date > endStr) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `Tanggal ${date} di luar bulan plan ${plan.plan_month}`,
        });
      }
  
      const lineIds = [...new Set((plan.details ?? []).map(d => d.assigned_line_id).filter(Boolean))];
      const lineWhere = lineIds.length ? { [Op.in]: lineIds } : { [Op.ne]: null };
  
      // Check day status in master calendar
      const calendarRowsOnDay = await SShiftCalendars.findAll({
        where: { line_id: lineWhere, active: true,
          start_date: { [Op.lte]: date },
          end_date:   { [Op.gte]: date },
        },
        include: [
          { model: RefTypeCalendars, as: 'type_calendar', attributes: ['is_holiday'] },
          { model: SShifts,          as: 'shift',         attributes: ['shift_number'] },
        ],
        transaction: t,
      });
  
      const baseShiftNumbersOnDay = new Set(
        calendarRowsOnDay
          .filter(r => !r.type_calendar?.is_holiday)
          .map(r => r.shift?.shift_number)
          .filter(Boolean)
      );
  
      // Check existing adjustments on this day
      const existingAdjs = await SProductionPlanCalendarAdjustment.findAll({
        where:   { plan_id: id, date },
        include: [{ model: SShifts, as: 'shift', attributes: ['shift_number'] }],
        transaction: t,
      });
  
      const existingAddShiftNumbers = new Set(
        existingAdjs
          .filter(a => a.adjustment_type === 'ADD_SHIFT')
          .map(a => a.shift?.shift_number)
          .filter(Boolean)
      );
  
      // Existing overtime per shift_number: Map<shift_number, total_minutes>
      const existingOtByShift = new Map();
      for (const adj of existingAdjs.filter(a => a.adjustment_type === 'ADD_OVERTIME')) {
        const sn = adj.shift?.shift_number;
        if (sn != null) {
          existingOtByShift.set(sn, (existingOtByShift.get(sn) ?? 0) + (adj.overtime_minutes ?? 0));
        }
      }
  
      // Resolve all shift_number into shift_id
      const allShiftNumbers = [...new Set(inputShiftNumbers)];
      const shiftRecords = await SShifts.findAll({
        where: { shift_number: { [Op.in]: allShiftNumbers }, category: 'PRODUCTIVE', active: true },
        order: [['start_time', 'ASC']],
        transaction: t,
      });
  
      // Take one representative per shift_number (first PRODUCTIVE segment)
      const shiftIdByNumber = new Map();
      for (const s of shiftRecords) {
        if (!shiftIdByNumber.has(s.shift_number)) shiftIdByNumber.set(s.shift_number, s.id);
      }
  
      // Set of shift_number already active (master base OR previously added)
      const activeShiftNumbers = new Set([...baseShiftNumbersOnDay, ...existingAddShiftNumbers]);
  
      // Only count truly new shift_number (not active via base nor existing ADD_SHIFT)
      const newShiftNumbers = inputShiftNumbers.filter(sn => !activeShiftNumbers.has(sn));
  
      // Validate against max 3 shifts using already-active count
      const totalActiveShifts = activeShiftNumbers.size;
      if (totalActiveShifts + newShiftNumbers.length > 3) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 409,
          error:  `Menambahkan ${newShiftNumbers.length} shift baru akan melebihi maksimum 3 shift per hari ` +
                  `(saat ini sudah ada ${totalActiveShifts} shift aktif pada ${date})`,
        });
      }
  
      const adjustmentsToCreate = [];
      const validationErrors    = [];
  
      for (const input of shiftInputs) {
        const { shift_number, overtime_minutes } = input;
        const shiftId = shiftIdByNumber.get(shift_number);
  
        if (!shiftId) {
          validationErrors.push(`Shift ${shift_number} tidak ditemukan atau tidak aktif`);
          continue;
        }
  
        // A shift is active if present in master base or already added via ADD_SHIFT
        const isAlreadyActive = activeShiftNumbers.has(shift_number);
  
        // Create ADD_SHIFT only when the shift is not yet active on this day
        if (!isAlreadyActive) {
          adjustmentsToCreate.push({
            plan_id:             id,
            date,
            adjustment_type:     'ADD_SHIFT',
            shift_id:            shiftId,
            overtime_minutes:    null,
            inherited_from_plan: null,
          });
        }
  
        // Create ADD_OVERTIME when overtime_minutes is provided
        if (overtime_minutes != null && overtime_minutes > 0) {
          const existingOt = existingOtByShift.get(shift_number) ?? 0;
          const totalOt    = existingOt + overtime_minutes;
          if (totalOt > 120) {
            validationErrors.push(
              `Overtime Shift ${shift_number} pada ${date} melebihi 120 menit ` +
              `(existing: ${existingOt} min + tambahan: ${overtime_minutes} min = ${totalOt} min)`
            );
            continue;
          }
          adjustmentsToCreate.push({
            plan_id:             id,
            date,
            adjustment_type:     'ADD_OVERTIME',
            shift_id:            shiftId,
            overtime_minutes,
            inherited_from_plan: null,
          });
        }
      }
  
      if (validationErrors.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 409,
          error:  validationErrors.join('; '),
        });
      }
  
      if (adjustmentsToCreate.length === 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Tidak ada adjustment baru yang perlu dibuat (semua shift sudah aktif dan tidak ada overtime)',
        });
      }
  
      const created = await SProductionPlanCalendarAdjustment.bulkCreate(
        adjustmentsToCreate, { transaction: t }
      );
  
      // Reset calculation state
      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });
      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: 'Not_Calculated' },
        { where: { plan_id: id }, transaction: t }
      );
      await plan.update({ overall_status: 'Not_Calculated', total_qty_capacity: 0 }, { transaction: t });
  
      // Sync capacity params
      const capacityParam = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id: lineIds[0] },
        transaction: t,
      });
      if (capacityParam) {
        const effective = await buildEffectiveParams(capacityParam, plan.plan_month, id, t);
        const totalOtMinutes = await SProductionPlanCalendarAdjustment.sum('overtime_minutes', {
          where: { plan_id: id, adjustment_type: 'ADD_OVERTIME' },
          transaction: t,
        });
        const overtime_hours = parseFloat(((totalOtMinutes ?? 0) / 60).toFixed(2));
        await capacityParam.update({
          working_days:   effective.working_days,
          shifts_per_day: effective.shifts_per_day,
          overtime_hours,
        }, { transaction: t });
      }
  
      await this.logActivity(req, {
        moduleCode:   'production-plan',
        activityCode: 'UPDATE',
        resourceId:   plan.id,
        newData:      { date, created_count: created.length },
        description:  `Added ${created.length} calendar adjustment(s) on ${date} for plan ${plan.plan_number}`,
        transaction:  t,
      });
  
      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    201,
        message: `${created.length} calendar adjustment(s) added. Recalculate capacity to apply changes.`,
        data:    created,
      });
    } catch (error) {
      await t.rollback();
      console.error('[PlanModule][addCalendarAdjustment]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async updateCalendarAdjustment(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, adj_id } = req.params;
  
      const schema = Joi.object({
        overtime_minutes: Joi.number().integer().min(1).max(120).required(),
      });
  
      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }
  
      const { overtime_minutes } = validation.value;
  
      const plan = await SProductionPlan.findByPk(id, {
        include: [{ model: SProductionPlanDetail, as: 'details', attributes: ['assigned_line_id'], required: false }],
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Plan not found' });
      }
      if (!['Draft', 'Rejected'].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Calendar adjustments can only be modified on Draft or Rejected plans',
        });
      }
  
      const adjustment = await SProductionPlanCalendarAdjustment.findOne({
        where:   { id: adj_id, plan_id: id },
        include: [{ model: SShifts, as: 'shift', attributes: ['shift_number'] }],
        transaction: t,
      });
      if (!adjustment) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Calendar adjustment not found' });
      }
      if (adjustment.adjustment_type !== 'ADD_OVERTIME') {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Hanya adjustment ADD_OVERTIME yang bisa diedit. ADD_SHIFT tidak bisa diubah (hapus dan tambah ulang).',
        });
      }
  
      // ── Validasi total overtime per (date, shift) setelah update ──────────
      const otherOtForShift = await SProductionPlanCalendarAdjustment.sum('overtime_minutes', {
        where: {
          plan_id:         id,
          date:            adjustment.date,
          adjustment_type: 'ADD_OVERTIME',
          shift_id:        adjustment.shift_id,
          id:              { [Op.ne]: adj_id },
        },
        transaction: t,
      });
  
      const totalOt = (otherOtForShift ?? 0) + overtime_minutes;
      if (totalOt > 120) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 409,
          error:  `Total overtime untuk Shift ${adjustment.shift?.shift_number} pada ${adjustment.date} ` +
                  `akan menjadi ${totalOt} menit (maks 120 menit)`,
        });
      }
  
      await adjustment.update({ overtime_minutes }, { transaction: t });
  
      // ── Reset calculation state ────────────────────────────────────────────
      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });
      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: 'Not_Calculated' },
        { where: { plan_id: id }, transaction: t }
      );
      await plan.update({ overall_status: 'Not_Calculated', total_qty_capacity: 0 }, { transaction: t });
  
      // ── Sync overtime_hours di capacity params ────────────────────────────
      const lineIds = [...new Set((plan.details ?? []).map(d => d.assigned_line_id).filter(Boolean))];
      const capacityParam = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id: lineIds[0] },
        transaction: t,
      });
      if (capacityParam) {
        const totalOtMinutes = await SProductionPlanCalendarAdjustment.sum('overtime_minutes', {
          where: { plan_id: id, adjustment_type: 'ADD_OVERTIME' },
          transaction: t,
        });
        const overtime_hours = parseFloat(((totalOtMinutes ?? 0) / 60).toFixed(2));
        await capacityParam.update({ overtime_hours }, { transaction: t });
      }
  
      await this.logActivity(req, {
        moduleCode:   'production-plan',
        activityCode: 'UPDATE',
        resourceId:   plan.id,
        newData:      adjustment,
        description:  `Updated overtime adjustment id=${adj_id} to ${overtime_minutes} min on ${adjustment.date}`,
        transaction:  t,
      });
  
      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: 'Overtime adjustment updated. Recalculate capacity to apply changes.',
        data:    adjustment,
      });
    } catch (error) {
      await t.rollback();
      console.error('[PlanModule][updateCalendarAdjustment]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async deleteCalendarAdjustment(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, adj_id } = req.params;
  
      const plan = await SProductionPlan.findByPk(id, {
        include: [{ model: SProductionPlanDetail, as: 'details', attributes: ['assigned_line_id'], required: false }],
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
          error:  "Calendar adjustments can only be removed from Draft or Rejected plans",
        });
      }
  
      const adjustment = await SProductionPlanCalendarAdjustment.findOne({
        where: { id: adj_id, plan_id: id }, transaction: t,
      });
      if (!adjustment) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Calendar adjustment not found" });
      }
  
      await adjustment.destroy({ transaction: t });
  
      // ── Reset calculation state ────────────────────────────────────────────
      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });
      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: "Not_Calculated" },
        { where: { plan_id: id }, transaction: t }
      );
      await plan.update({ overall_status: "Not_Calculated", total_qty_capacity: 0 }, { transaction: t });
  
      // ── Sync working_days / shifts_per_day / overtime_hours ke capacity_params ──
      const lineIds = [...new Set((plan.details ?? []).map(d => d.assigned_line_id).filter(Boolean))];
      if (lineIds.length > 0) {
        const capacityParams = await SProductionPlanCapacityParam.findAll({
          where: { plan_id: id, line_id: lineIds },
          transaction: t,
        });
  
        await Promise.all(
          capacityParams.map(async (param) => {
            const effective = await buildEffectiveParams(param, plan.plan_month, id, t);

            const totalOtMinutes = await SProductionPlanCalendarAdjustment.sum('overtime_minutes', {
              where: { plan_id: id, adjustment_type: 'ADD_OVERTIME' },
              transaction: t,
            });
            const overtime_hours = parseFloat(((totalOtMinutes ?? 0) / 60).toFixed(2));

            return param.update(
              {
                working_days:   effective.working_days,
                shifts_per_day: effective.shifts_per_day,
                overtime_hours,
              },
              { transaction: t }
            );
          })
        );
      }
  
      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: "Calendar adjustment removed" });
    } catch (error) {
      await t.rollback();
      console.error("[PlanModule][deleteCalendarAdjustment]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async updateCapacityParams(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      // Only manpower and efficiency_factor are manually editable at plan level.
      // working_days, shifts_per_day, overtime_hours -> auto from calendar (recalculated on calculateCapacity)
      // working_hours_per_shift, max_takt_time       -> from line master data, read-only
      const schema = Joi.object({
        line_id:           Joi.number().integer().required(),
        manpower:           Joi.number().integer().min(1).optional(),
        efficiency_factor:  Joi.number().min(0).max(1).optional(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { line_id, ...paramFields } = validation.value;

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "Capacity params can only be updated on Draft or Rejected plans",
        });
      }

      const record = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id }, transaction: t,
      });
      if (!record) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 404,
          error:  "Capacity params not found for this line. They should have been auto-created during plan creation.",
        });
      }

      const updatableFields = ["manpower", "efficiency_factor"];
      const updates = {};
      for (const field of updatableFields) {
        if (paramFields[field] !== undefined) updates[field] = paramFields[field];
      }

      if (Object.keys(updates).length === 0) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "No valid param fields provided to update" });
      }

      await record.update({ ...updates, param_type: "adjusted" }, { transaction: t });

      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id, line_id }, transaction: t });
      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: "Not_Calculated" },
        { where: { plan_id: id, assigned_line_id: line_id }, transaction: t }
      );
      await plan.update({ overall_status: "Not_Calculated", total_qty_capacity: 0 }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "UPDATE",
        resourceId:   plan.id,
        newData:      record,
        description:  `Updated capacity params (adjusted) for line ${line_id} on plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: "Capacity params updated. param_type set to adjusted. Run calculateCapacity to apply.",
        data:    record,
      });
    } catch (error) {
      await t.rollback();
      console.error("[PlanModule][updateCapacityParams]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async calculateCapacity(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
  
      const schema     = Joi.object({ line_id: Joi.number().integer().required() });
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
  
      const param = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id }, transaction: t,
      });
      if (!param) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Capacity parameters not found for this line. They should have been auto-created during plan creation. Please contact admin.',
        });
      }
  
      const lineResult = await _calcLineCapacity({
        plan_id:    id,
        line_id,
        plan_month: plan.plan_month,
        plan,           // ← tambahan
        param,
        planId:     id,
        t,
      });
  
      if (lineResult.skipped) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `max_takt_time is 0 or not set for line ${line_id}. Please reconfigure the line master capacity params.`,
        });
      }
  
      const allParams = await SProductionPlanCapacityParam.findAll({ where: { plan_id: id }, transaction: t });
      const { aggregatedStatus } = await _aggregateOverallStatus({
        plan_id: id, plan, allParams, lineResults: [lineResult], t,
      });
  
      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: `Capacity calculated for line ${line_id}. Overall plan status: ${aggregatedStatus}`,
        data: {
          line_id,
          overall_status:           aggregatedStatus,
          line_status:              lineResult.line_status,
          total_capacity_units:     lineResult.total_cap_units,
          consumed_by_parent_plan:  lineResult.consumed_units,
          total_qty_this_line:      lineResult.total_qty_this_line,
          capacity_gap_units:       lineResult.capacity_gap_units,
          utilization_pct:          lineResult.utilization_pct,
          capacity_info:            lineResult.capacity_info,
          params_used: {
            param_type:              param.param_type,
            working_days:            param.working_days,
            shifts_per_day:          param.shifts_per_day,
            working_hours_per_shift: parseFloat(param.working_hours_per_shift),
            efficiency_factor:       parseFloat(param.efficiency_factor),
            max_takt_time:           param.max_takt_time,
            note: plan.plan_type === 'AMENDMENT'
              ? 'Amendment plan: total_capacity_units already reflects available capacity after deducting consumed slots from the parent plan Released PO(s).'
              : 'working_days, shifts_per_day, and overtime_hours are derived from the effective calendar.',
          },
        },
      });
    } catch (error) {
      await t.rollback();
      console.error('[PlanModule][calculateCapacity]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async calculateAllCapacity(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
  
      const plan = await SProductionPlan.findByPk(id, {
        include:     [{ model: SProductionPlanDetail, as: 'details' }],
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
  
      const allParams = await SProductionPlanCapacityParam.findAll({ where: { plan_id: id }, transaction: t });
      if (allParams.length === 0) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'No capacity parameters found for this plan.' });
      }
  
      const allDetailIds = plan.details.map((d) => d.id);
      if (allDetailIds.length > 0) {
        await SProductionPlanDetail.update(
          { qty_capacity: 0, capacity_gap: 0, status: 'Not_Calculated' },
          { where: { id: allDetailIds }, transaction: t }
        );
      }
      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });
  
      const lineResults = [];
      for (const p of allParams) {
        const result = await _calcLineCapacity({
          plan_id:    id,
          line_id:    p.line_id,
          plan_month: plan.plan_month,
          plan,           // ← tambahan
          param:      p,
          planId:     id,
          t,
        });
        lineResults.push(result);
      }
  
      const { aggregatedStatus, total_qty_capacity } = await _aggregateOverallStatus({
        plan_id: id, plan, allParams, lineResults, t,
      });
  
      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: `${lineResults.filter((r) => !r.skipped).length} line(s) calculated. Overall plan status: ${aggregatedStatus}`,
        data: {
          overall_status:   aggregatedStatus,
          total_qty_capacity,
          plan_type:        plan.plan_type,
          lines_calculated: lineResults.filter((r) => !r.skipped).length,
          lines_skipped:    lineResults.filter((r) =>  r.skipped).length,
          line_results:     lineResults.map((r) => ({
            line_id:                 r.line_id,
            skipped:                 r.skipped,
            reason:                  r.reason,
            line_status:             r.line_status,
            total_capacity_units:    r.total_cap_units,
            consumed_by_parent_plan: r.consumed_units ?? 0,
            total_qty_this_line:     r.total_qty_this_line,
            capacity_gap_units:      r.capacity_gap_units,
            utilization_pct:         r.utilization_pct,
          })),
        },
      });
    } catch (error) {
      await t.rollback();
      console.error('[PlanModule][calculateAllCapacity]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async submitForApproval(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const plan = await SProductionPlan.findByPk(id, {
        include:     [{ model: SProductionPlanDetail, as: "details" }],
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Only Draft or Rejected plans can be submitted" });
      }

      if (plan.overall_status === "Not_Calculated") {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "Capacity has not been calculated yet. Please run capacity calculation before submitting.",
        });
      }

      const unrouted = plan.details.filter((d) => !d.assigned_line_id);
      if (unrouted.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `${unrouted.length} product(s) have no routing/line configured. Please set up part routing first.`,
        });
      }

      const params  = await SProductionPlanCapacityParam.findAll({ where: { plan_id: id }, transaction: t });
      const results = await SProductionPlanCapacityResult.findAll({ where: { plan_id: id }, transaction: t });

      const uncalculatedLines = params.filter((p) => !results.some((r) => r.line_id === p.line_id));
      if (uncalculatedLines.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `${uncalculatedLines.length} line(s) have not been calculated yet. Please run capacity calculation for all lines first.`,
        });
      }

      const oldData = plan.toJSON();
      await plan.update({ status: "Pending_Approval" }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "SUBMIT",
        resourceId:   plan.id,
        oldData,
        newData:      plan,
        description:  `Submitted Production Plan ${plan.plan_number} for approval`,
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
        },
      });
    } catch (error) {
      await t.rollback();
      console.error("[PlanModule][submitForApproval]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async approve(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id }   = req.params;
      const schema   = Joi.object({ approval_notes: Joi.string().optional().allow("", null) });

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
      console.error("[PlanModule][approve]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async reject(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id }   = req.params;
      const schema   = Joi.object({ rejection_reason: Joi.string().required() });

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
      console.error("[PlanModule][reject]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

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

      await SProductionPlanDetail.destroy({ where: { plan_id: id }, transaction: t });
      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });
      await SProductionPlanCapacityParam.destroy({ where: { plan_id: id }, transaction: t });
      await SProductionPlanCalendarAdjustment.destroy({ where: { plan_id: id }, transaction: t });

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
      console.error("[PlanModule][delete]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async getDropdown(req, res) {
    try {
      const plans = await SProductionPlan.findAll({
        where:      { status: "Approved", deleted_at: null },
        attributes: [
          "id", "plan_number", "plan_month", "plan_type", "parent_plan_id",
          "plan_description", "earliest_delivery_date", "latest_delivery_date",
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
      console.error("[PlanModule][getDropdown]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }
}

export default new PlanModule();