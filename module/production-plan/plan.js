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
  SPartRoutingDetails,
  SStations,
  sequelize,
} = db;

// ─── HELPERS ────────────────────────────────────────────────────────────────

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

/**
 * Menghitung kapasitas lini dalam satuan unit dan menit.
 * working_hours_per_shift : JAM
 * overtime_hours          : JAM PER HARI (total semua shift)
 * max_takt_time           : DETIK
 * efficiency_factor       : desimal (0–1)
 */
function calcCapacityUnits(param) {
  const taktMin = param.max_takt_time / 60;

  const regular_min_per_shift   = param.working_hours_per_shift * 60;
  const shifts_per_day          = param.shifts_per_day > 0 ? param.shifts_per_day : 1;
  const ot_hours_per_shift      = (param.overtime_hours ?? 0) / shifts_per_day;
  const ot_min_per_shift        = ot_hours_per_shift * 60;
  const effective_min_per_shift = (regular_min_per_shift + ot_min_per_shift) * param.efficiency_factor;

  const cap_per_shift   = taktMin > 0 ? Math.floor(effective_min_per_shift / taktMin) : 0;
  const cap_per_day     = cap_per_shift * param.shifts_per_day;
  const total_cap_units = cap_per_day * param.working_days;

  const regular_minutes   = param.working_days * param.shifts_per_day * regular_min_per_shift;
  const overtime_minutes  = param.working_days * param.shifts_per_day * ot_min_per_shift;
  const available_minutes = regular_minutes + overtime_minutes;
  const total_cap_minutes = available_minutes * param.efficiency_factor;

  return {
    regular_minutes,
    overtime_minutes,
    available_minutes,
    total_cap_minutes,
    total_cap_units,
    cap_per_shift,
    cap_per_day,
    effective_min_per_shift,
  };
}

// Single-line: lookup routing aktif per part, kembalikan { line_id, routing_id } tunggal
async function getRoutingByPartIds(partIds, t) {
  if (!partIds.length) return new Map();

  const routings = await SPartRoutings.findAll({
    where:      { part_id: partIds, active: true, is_default: true },
    attributes: ["id", "part_id", "line_id"],
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

// Auto-assign assigned_line_id & routing_id pada detail, serta init BASE param bila belum ada
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

  // Init BASE capacity params untuk line yang belum punya
  if (assignedLineIds.size === 0) return;

  const masterParamsAll = await SLineCapacityParam.findAll({
    where: {
      line_id: [...assignedLineIds],
      [Op.or]: [
        { param_year: { [Op.lt]: paramYear } },
        { param_year: paramYear, param_month: { [Op.lte]: paramMonth } },
      ],
    },
    order: [["line_id", "ASC"], ["param_year", "DESC"], ["param_month", "DESC"]],
    transaction: t,
  });

  const masterMap = new Map();
  for (const m of masterParamsAll) {
    if (!masterMap.has(m.line_id)) masterMap.set(m.line_id, m);
  }

  const existingParams = await SProductionPlanCapacityParam.findAll({
    where: { plan_id: planId, line_id: [...assignedLineIds] },
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

async function _calcLineCapacity({ plan_id, line_id, param, t }) {
  if (!param.max_takt_time || param.max_takt_time <= 0) {
    return { line_id, skipped: true, reason: "max_takt_time is 0 or not set" };
  }

  const {
    regular_minutes, overtime_minutes, available_minutes,
    total_cap_minutes, total_cap_units,
    cap_per_shift, cap_per_day, effective_min_per_shift,
  } = calcCapacityUnits({
    working_days:            param.working_days,
    shifts_per_day:          param.shifts_per_day,
    working_hours_per_shift: parseFloat(param.working_hours_per_shift),
    manpower:                param.manpower,
    efficiency_factor:       parseFloat(param.efficiency_factor),
    overtime_hours:          parseFloat(param.overtime_hours ?? 0),
    max_takt_time:           param.max_takt_time,
  });

  const max_takt_time_seconds = param.max_takt_time;
  const max_takt_time_minutes = max_takt_time_seconds / 60;
  const capacity_per_hour     = parseFloat((60 / max_takt_time_minutes).toFixed(4));

  // Ambil semua detail yang assigned ke lini ini dalam plan ini
  const assignedDetails = await SProductionPlanDetail.findAll({
    where:      { plan_id, assigned_line_id: line_id },
    attributes: ["id", "qty_request"],
    transaction: t,
  });

  const total_qty_this_line = assignedDetails.reduce((s, d) => s + d.qty_request, 0);
  const line_status         = total_cap_units >= total_qty_this_line ? "POSSIBLE" : "IMPOSSIBLE";

  // Update status & qty_capacity di setiap detail
  const ratio = total_qty_this_line > 0 ? Math.min(total_cap_units / total_qty_this_line, 1) : 1;
  await Promise.all(
    assignedDetails.map((d) => {
      const qty_capacity = Math.floor(d.qty_request * ratio);
      const capacity_gap = total_cap_units - total_qty_this_line;
      return SProductionPlanDetail.update(
        { qty_capacity, capacity_gap, status: line_status },
        { where: { id: d.id }, transaction: t }
      );
    })
  );

  const takt_time_minutes         = max_takt_time_seconds / 60;
  const effective_capacity_minutes = parseFloat(total_cap_minutes.toFixed(2));
  const serial_required_minutes    = parseFloat((total_qty_this_line * takt_time_minutes).toFixed(2));
  const utilization_pct            = total_cap_units > 0
    ? parseFloat(((total_qty_this_line / total_cap_units) * 100).toFixed(2))
    : 0;
  const capacity_gap_minutes = parseFloat(
    (effective_capacity_minutes - serial_required_minutes).toFixed(2)
  );

  // Upsert capacity result
  const [result, created] = await SProductionPlanCapacityResult.findOrCreate({
    where:    { plan_id, line_id },
    defaults: {
      plan_id, line_id,
      max_takt_time:           max_takt_time_seconds,
      capacity_per_hour,
      total_capacity_minutes:  effective_capacity_minutes,
      total_required_minutes:  serial_required_minutes,
      capacity_gap_minutes,
      utilization_pct,
      status:                  line_status,
      total_capacity_units:    total_cap_units,
      calculated_at:           new Date(),
    },
    transaction: t,
  });
  if (!created) {
    await result.update({
      max_takt_time:           max_takt_time_seconds,
      capacity_per_hour,
      total_capacity_minutes:  effective_capacity_minutes,
      total_required_minutes:  serial_required_minutes,
      capacity_gap_minutes,
      utilization_pct,
      status:                  line_status,
      total_capacity_units:    total_cap_units,
      calculated_at:           new Date(),
    }, { transaction: t });
  }

  return {
    line_id,
    skipped: false,
    line_status,
    total_cap_units,
    total_qty_this_line,
    serial_required_minutes,
    effective_capacity_minutes,
    capacity_gap_minutes,
    utilization_pct,
    capacity_info: {
      max_takt_time_seconds,
      capacity_per_hour,
      regular_minutes:         parseFloat(regular_minutes.toFixed(2)),
      overtime_minutes:        parseFloat(overtime_minutes.toFixed(2)),
      available_minutes:       parseFloat(available_minutes.toFixed(2)),
      cap_per_shift,
      cap_per_day,
      effective_min_per_shift: parseFloat(effective_min_per_shift.toFixed(4)),
    },
  };
}

async function _aggregateOverallStatus({ plan_id, plan, allParams, lineResults, t }) {
  const freshResultMap = new Map(
    lineResults.filter((r) => !r.skipped).map((r) => [r.line_id, r.line_status])
  );

  const existingResults = await SProductionPlanCapacityResult.findAll({
    where:      { plan_id },
    attributes: ["line_id", "status"],
    transaction: t,
  });
  const existingResultMap = new Map(existingResults.map((r) => [r.line_id, r.status]));

  const allLinesHaveResult = allParams.every(
    (p) => freshResultMap.has(p.line_id) || existingResultMap.has(p.line_id)
  );

  const allDetails = await SProductionPlanDetail.findAll({
    where:      { plan_id },
    attributes: ["id", "qty_request", "assigned_line_id", "qty_capacity", "status"],
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

async function checkPlanLineConflicts(currentPlanId, lineIds, t) {
  if (!lineIds || lineIds.length === 0) return [];

  const conflictingParams = await SProductionPlanCapacityParam.findAll({
    where: {
      line_id:  { [Op.in]: lineIds },
      plan_id:  { [Op.ne]: currentPlanId },
    },
    include: [{
      model:    SProductionPlan,
      as:       "plan",
      where:    { status: { [Op.in]: ["Approved", "Pending_Approval"] } },
      attributes: ["id", "plan_number", "status", "earliest_delivery_date", "latest_delivery_date"],
      required: true,
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

// ─── MODULE ─────────────────────────────────────────────────────────────────

class PlanModule extends BaseModule {

  // LIST
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

      // On-the-fly: hitung total_products & total_qty_request per plan
      const planIds = rows.map((r) => r.id);
      let detailAggMap = new Map();
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
      console.log(`[PlanModule][list]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // DETAIL
  async detail(req, res) {
    try {
      const { id } = req.params;

      const plan = await SProductionPlan.findByPk(id, {
        include: [
          {
            model:    SProductionPlanDetail,
            as:       "details",
            separate: true,
            include: [
              { model: SCustomers, as: "customer",      attributes: ["id", "name"] },
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
        ],
      });

      if (!plan) {
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }

      const details         = plan.details ?? [];
      const total_products  = new Set(details.map((d) => d.part_id)).size;
      const total_qty_request = details.reduce((s, d) => s + d.qty_request, 0);

      return helper.sendResponse(res, {
        status: true,
        code:   200,
        data:   { ...plan.toJSON(), total_products, total_qty_request },
      });
    } catch (error) {
      console.log(`[PlanModule][detail]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // GET AVAILABLE DELIVERY ORDERS
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

      // DO yang sudah dipakai plan aktif: cari via plan_details
      const allocatedDetails = await SProductionPlanDetail.findAll({
        include: [{
          model:      SProductionPlan,
          as:         "plan",
          where:      { status: { [Op.notIn]: ["Rejected", "Cancelled"] } },
          attributes: [],
        }],
        attributes: ["do_id"],
      });
      const allocatedIds = [...new Set(allocatedDetails.map((r) => r.do_id))];

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
      console.log(`[PlanModule][getAvailableDeliveryOrders]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // CREATE
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
            error:  `Cannot create plan for (${plan_month}). Plan month cannot be in the past.`,
          });
        }
        if (monthsDiff > 3) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  `Cannot create plan for (${plan_month}). Plan month cannot be more than 3 months in the future.`,
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
            include:    [{ model: SSalesPurchaseOrderDetails, as: "spoDetail", attributes: ["id", "part_id"] }],
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

      const isAmendment = plan_type === "AMENDMENT";
      const prefix      = isAmendment ? `PP-${plan_month}-A` : `PP-${plan_month}-`;
      const lastPlan    = await SProductionPlan.findOne({
        where:   { plan_number: { [Op.iLike]: `${prefix}%` } },
        order:   [["plan_number", "DESC"]],
        paranoid: false,
        transaction: t,
        lock:    t.LOCK.UPDATE,
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

      const detailRows     = Array.from(detailMap.values()).map((d, i) => ({ ...d, sequence: i + 1 }));
      const createdDetails = await SProductionPlanDetail.bulkCreate(detailRows, {
        returning: true, transaction: t,
      });

      const partIds    = [...new Set(createdDetails.map((d) => d.part_id))];
      const routingMap = await getRoutingByPartIds(partIds, t);
      await autoAssignDetails(plan.id, createdDetails, routingMap, t, paramYear, paramMonth);

      const partsWithNoRouting = partIds.filter((pid) => !routingMap.has(pid));

      // On-the-fly summary
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
        },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][create]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // UPDATE
  async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id }    = req.params;
      const schema    = Joi.object({
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
        moduleCode:  "production-plan", activityCode: "UPDATE",
        resourceId:  plan.id, oldData, newData: plan,
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

  // SYNC DOs
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
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "Only Draft or Rejected plans can be synced",
        });
      }

      const { startStr, endStr, year: paramYear, month: paramMonth } = getPlanMonthRange(plan.plan_month);

      // DO yang sudah terdaftar di plan ini
      const currentDetails = await SProductionPlanDetail.findAll({
        where:      { plan_id: id },
        attributes: ["id", "do_id"],
        transaction: t,
      });
      const currentDoIds = [...new Set(currentDetails.map((d) => d.do_id))];
      const toAdd        = do_ids.filter((did) => !currentDoIds.includes(did));
      const toRemove     = currentDoIds.filter((did) => !do_ids.includes(did));

      // Hapus detail untuk DO yang di-remove
      if (toRemove.length > 0) {
        const detailIdsToRemove = currentDetails
          .filter((d) => toRemove.includes(d.do_id))
          .map((d) => d.id);

        if (detailIdsToRemove.length > 0) {
          await SProductionPlanDetail.destroy({
            where: { id: detailIdsToRemove }, transaction: t,
          });
        }

        // Hapus capacity params & results untuk line yang tidak lagi dipakai
        const remainingDetails = await SProductionPlanDetail.findAll({
          where:      { plan_id: id },
          attributes: ["assigned_line_id"],
          transaction: t,
        });
        const activeLineIds = [...new Set(
          remainingDetails.map((d) => d.assigned_line_id).filter(Boolean)
        )];

        if (activeLineIds.length > 0) {
          await SProductionPlanCapacityParam.destroy({
            where: { plan_id: id, line_id: { [Op.notIn]: activeLineIds } },
            transaction: t,
          });
          await SProductionPlanCapacityResult.destroy({
            where: { plan_id: id, line_id: { [Op.notIn]: activeLineIds } },
            transaction: t,
          });
        } else {
          await SProductionPlanCapacityParam.destroy({ where: { plan_id: id }, transaction: t });
          await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });
        }
      }

      // Tambah detail untuk DO baru
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
              include:    [{ model: SSalesPurchaseOrderDetails, as: "spoDetail", attributes: ["id", "part_id"] }],
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
            status:         false, code: 400,
            error:          `${invalidDos.length} DO memiliki shipment_date di luar bulan ${plan.plan_month} ` +
                            `(${startStr} s/d ${endStr}). Hanya DO di bulan yang sama yang bisa ditambahkan.`,
            invalid_do_ids: invalidDos.map((d) => d.id),
          });
        }

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
        const routingMap = await getRoutingByPartIds(partIds, t);
        await autoAssignDetails(plan.id, newDetails, routingMap, t, paramYear, paramMonth);
      }

      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: "Not_Calculated" },
        { where: { plan_id: id }, transaction: t }
      );
      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });
      await plan.update({ overall_status: "Not_Calculated", total_qty_capacity: 0 }, { transaction: t });

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

  // RESET CAPACITY PARAMS — mengembalikan ke nilai master default, param_type → 'base'
  async saveCapacityParams(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id }   = req.params;
      const schema   = Joi.object({ line_id: Joi.number().integer().required() });

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
        order:       [["param_year", "DESC"], ["param_month", "DESC"]],
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

      const baseValues = {
        working_days:            masterParams.default_working_days,
        shifts_per_day:          masterParams.default_shifts_per_day,
        working_hours_per_shift: masterParams.default_working_hours_per_shift,
        manpower:                masterParams.default_manpower,
        efficiency_factor:       masterParams.default_efficiency_factor,
        overtime_hours:          masterParams.default_overtime_hours,
        max_takt_time:           masterParams.default_max_takt_time,
      };

      const [record, created] = await SProductionPlanCapacityParam.findOrCreate({
        where:    { plan_id: id, line_id },
        defaults: { plan_id: id, line_id, param_type: "base", ...baseValues },
        transaction: t,
      });

      if (!created) {
        await record.update({ param_type: "base", ...baseValues }, { transaction: t });
      }

      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id, line_id }, transaction: t });

      await this.logActivity(req, {
        moduleCode:  "production-plan", activityCode: "UPDATE",
        resourceId:  plan.id, newData: record,
        description: `Reset capacity params to base for line ${line_id} on plan ${plan.plan_number}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    created ? 201 : 200,
        message: created
          ? "BASE parameters created from line master"
          : "Parameters reset to base (line master defaults)",
        data: record,
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][saveCapacityParams]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // UPDATE CAPACITY PARAMS — mengubah nilai param, param_type otomatis → 'adjusted'
  async updateCapacityParams(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        line_id:                 Joi.number().integer().required(),
        working_days:            Joi.number().integer().min(1).optional(),
        shifts_per_day:          Joi.number().integer().min(1).optional(),
        working_hours_per_shift: Joi.number().min(0).optional(),
        manpower:                Joi.number().integer().min(1).optional(),
        efficiency_factor:       Joi.number().min(0).max(1).optional(),
        overtime_hours:          Joi.number().min(0).optional(),
        max_takt_time:           Joi.number().integer().min(1).optional(),
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
          error:  "Capacity params not found for this line. Initialize params first.",
        });
      }

      const updatableFields = [
        "working_days", "shifts_per_day", "working_hours_per_shift",
        "manpower", "efficiency_factor", "overtime_hours", "max_takt_time",
      ];
      const updates = {};
      for (const field of updatableFields) {
        if (paramFields[field] !== undefined) updates[field] = paramFields[field];
      }

      if (Object.keys(updates).length === 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "No valid param fields provided to update",
        });
      }

      // Setiap perubahan param → param_type otomatis menjadi 'adjusted'
      await record.update({ ...updates, param_type: "adjusted" }, { transaction: t });

      // Reset hasil kalkulasi karena param berubah
      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id, line_id }, transaction: t });
      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: "Not_Calculated" },
        { where: { plan_id: id, assigned_line_id: line_id }, transaction: t }
      );
      await plan.update(
        { overall_status: "Not_Calculated", total_qty_capacity: 0 },
        { transaction: t }
      );

      await this.logActivity(req, {
        moduleCode:  "production-plan", activityCode: "UPDATE",
        resourceId:  plan.id, newData: record,
        description: `Updated capacity params (adjusted) for line ${line_id} on plan ${plan.plan_number}`,
        transaction: t,
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
      console.log(`[PlanModule][updateCapacityParams]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // CALCULATE CAPACITY (per-line)
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
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Plan cannot be calculated in current status" });
      }

      const param = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id }, transaction: t,
      });
      if (!param) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "Capacity parameters not found for this line. They should have been auto-created during plan creation. Please contact admin.",
        });
      }

      const lineResult = await _calcLineCapacity({ plan_id: id, line_id, param, t });

      if (lineResult.skipped) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `max_takt_time is 0 or not set for line ${line_id}. Please reconfigure the line master capacity params.`,
        });
      }

      const allParams = await SProductionPlanCapacityParam.findAll({
        where: { plan_id: id }, transaction: t,
      });
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
          overall_status:             aggregatedStatus,
          line_status:                lineResult.line_status,
          total_capacity_units:       lineResult.total_cap_units,
          total_qty_this_line:        lineResult.total_qty_this_line,
          total_required_minutes:     lineResult.serial_required_minutes,
          effective_capacity_minutes: lineResult.effective_capacity_minutes,
          capacity_gap_minutes:       lineResult.capacity_gap_minutes,
          utilization_pct:            lineResult.utilization_pct,
          capacity_info:              lineResult.capacity_info,
          params_used: {
            param_type:              param.param_type,
            working_days:            param.working_days,
            shifts_per_day:          param.shifts_per_day,
            working_hours_per_shift: parseFloat(param.working_hours_per_shift),
            efficiency_factor:       parseFloat(param.efficiency_factor),
            overtime_hours:          parseFloat(param.overtime_hours ?? 0),
            max_takt_time:           param.max_takt_time,
          },
        },
      });
    } catch (error) {
      await t.rollback();
      console.log("[PlanModule][calculateCapacity]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // CALCULATE ALL CAPACITY
  async calculateAllCapacity(req, res) {
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
        return helper.sendResponse(res, { status: false, code: 400, error: "Plan cannot be calculated in current status" });
      }

      const allParams = await SProductionPlanCapacityParam.findAll({
        where: { plan_id: id }, transaction: t,
      });
      if (allParams.length === 0) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "No capacity parameters found for this plan." });
      }

      const lineIds = allParams.map((p) => p.line_id);

      // Reset semua detail & results
      const allDetailIds = plan.details.map((d) => d.id);
      if (allDetailIds.length > 0) {
        await SProductionPlanDetail.update(
          { qty_capacity: 0, capacity_gap: 0, status: "Not_Calculated" },
          { where: { id: allDetailIds }, transaction: t }
        );
      }
      await SProductionPlanCapacityResult.destroy({ where: { plan_id: id }, transaction: t });

      const lineResults = [];
      for (const p of allParams) {
        const result = await _calcLineCapacity({ plan_id: id, line_id: p.line_id, param: p, t });
        lineResults.push(result);
      }

      const { aggregatedStatus, total_qty_capacity } = await _aggregateOverallStatus({
        plan_id: id, plan, allParams, lineResults, t,
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
      console.log("[PlanModule][calculateAllCapacity]:", error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // SUBMIT FOR APPROVAL
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

      if (plan.overall_status === "IMPOSSIBLE") {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  "Production Plan cannot be submitted. Overall capacity status is IMPOSSIBLE. " +
                  "Please adjust capacity params on the bottleneck line(s) until all lines reach " +
                  "POSSIBLE status before submitting.",
        });
      }

      // Guard: semua detail harus punya assigned_line
      const unrouted = plan.details.filter((d) => !d.assigned_line_id);
      if (unrouted.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `${unrouted.length} product(s) have no routing/line configured. ` +
                  `Please set up part routing first.`,
        });
      }

      // Guard: semua line param sudah punya hasil kalkulasi
      const params  = await SProductionPlanCapacityParam.findAll({
        where: { plan_id: id }, transaction: t,
      });
      const results = await SProductionPlanCapacityResult.findAll({
        where: { plan_id: id }, transaction: t,
      });
      const uncalculatedLines = params.filter((p) => !results.some((r) => r.line_id === p.line_id));
      if (uncalculatedLines.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `${uncalculatedLines.length} line(s) have not been calculated yet. ` +
                  `Please run capacity calculation for all lines first.`,
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
      console.log(`[PlanModule][submitForApproval]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // APPROVE
  async approve(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id }   = req.params;
      const schema   = Joi.object({
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

  // REJECT
  async reject(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id }   = req.params;
      const schema   = Joi.object({
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

  // DELETE
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

  // GET DROPDOWN
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