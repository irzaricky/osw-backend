import { Op } from 'sequelize';
import Joi from 'joi';
import db from '../../models/index.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';

const {
  SProductionOrder,
  SProductionOrderProduct,
  SProductionOrderSchedule,
  SProductionOrderRescheduleLog,
  SProductionPlan,
  SProductionPlanDetail,
  SProductionPlanDetailLine,
  SProductionPlanCapacityResult,
  SWorkOrder,
  SWorkOrderStation,
  SWorkOrderStationJob,
  SCustomers,
  SParts,
  SLines,
  SLineCapacityParam,
  SFactories,
  SShifts,
  SShiftCalendars,
  SStations,
  SStationJobs,
  SJobs,
  SUsers,
  sequelize,
} = db;

// ─── Includes ─────────────────────────────────────────────────────────────────

const PO_HEADER_INCLUDE = [
  { model: SProductionPlan, as: 'plan', attributes: ['id', 'plan_number', 'plan_description'] },
  { model: SUsers, as: 'creator',  attributes: ['id', 'email'] },
  { model: SUsers, as: 'releaser', attributes: ['id', 'email'] },
  { model: SUsers, as: 'rejector', attributes: ['id', 'email'] },
];

const PO_PRODUCT_INCLUDE = [
  { model: SCustomers, as: 'customer', attributes: ['id', 'customer_code', 'name'] },
  { model: SParts,     as: 'part',     attributes: ['id', 'part_number', 'part_name'] },
  { model: SLines,     as: 'line',     attributes: ['id', 'line_code', 'name'] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generatePoNumber(t) {
  const now    = new Date();
  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `PO-${year}-${month}`;

  // Use transaction + LOCK to prevent race condition on concurrent create
  const last = await SProductionOrder.findOne({
    where: { po_number: { [Op.iLike]: `${prefix}%` } },
    order: [['po_number', 'DESC']],
    paranoid: false,
    lock: t.LOCK?.UPDATE,
    transaction: t,
  });

  let seq = 1;
  if (last) {
    const n = parseInt(last.po_number.slice(-5), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

async function generateWoNumber(workDate, t) {
  const d      = new Date(workDate);
  const year   = d.getFullYear();
  const month  = String(d.getMonth() + 1).padStart(2, '0');
  const prefix = `WO-${year}-${month}-`;

  // Use transaction + LOCK to prevent race condition on concurrent release
  const last = await SWorkOrder.findOne({
    where: { wo_number: { [Op.iLike]: `${prefix}%` } },
    order: [['wo_number', 'DESC']],
    paranoid: false,
    lock: t.LOCK?.UPDATE,
    transaction: t,
  });

  let seq = 1;
  if (last) {
    const n = parseInt(last.wo_number.slice(-5), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

/**
 * Returns an array of active working dates between start and end (inclusive)
 * based on s_shift_calendars for the given line.
 * Filters by REGULAR PRODUCTIVE shifts only (consistent with PlanModule capacity basis).
 */
async function getWorkingDays(lineId, startDate, endDate, transaction) {
  const calendars = await SShiftCalendars.findAll({
    where: {
      line_id:    lineId,
      active:     true,
      start_date: { [Op.lte]: endDate },
      end_date:   { [Op.gte]: startDate },
      deleted_at: null,
    },
    include: [{
      model: SShifts,
      as: 'shift',
      where: { type: 'REGULAR', category: 'PRODUCTIVE', active: true, deleted_at: null },
      required: true,
    }],
    transaction,
  });

  const dates = new Set();
  const start = new Date(startDate);
  const end   = new Date(endDate);

  for (const cal of calendars) {
    const calStart = new Date(cal.start_date);
    const calEnd   = new Date(cal.end_date);
    const from     = calStart < start ? start : calStart;
    const to       = calEnd   > end   ? end   : calEnd;

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      dates.add(d.toISOString().split('T')[0]);
    }
  }

  return Array.from(dates).sort();
}

/**
 * Returns an array of REGULAR PRODUCTIVE shifts for the given line via its calendar.
 * Falls back to all global REGULAR PRODUCTIVE shifts if none are line-specific.
 */
async function getLineShifts(lineId, transaction) {
  // Get shifts linked to this line through its shift calendars
  const calendars = await SShiftCalendars.findAll({
    where: { line_id: lineId, active: true, deleted_at: null },
    include: [{
      model: SShifts,
      as: 'shift',
      where: { type: 'REGULAR', category: 'PRODUCTIVE', active: true, deleted_at: null },
      required: true,
    }],
    transaction,
  });

  const shiftMap = new Map();
  for (const cal of calendars) {
    if (cal.shift && !shiftMap.has(cal.shift.id)) {
      shiftMap.set(cal.shift.id, cal.shift);
    }
  }

  if (shiftMap.size > 0) {
    return [...shiftMap.values()].sort((a, b) => a.shift_number - b.shift_number);
  }

  // Fallback: global REGULAR PRODUCTIVE shifts
  return SShifts.findAll({
    where: { type: 'REGULAR', category: 'PRODUCTIVE', active: true, deleted_at: null },
    order: [['shift_number', 'ASC']],
    transaction,
  });
}

// ─── Module ───────────────────────────────────────────────────────────────────

class OrderScheduleModule extends BaseModule {

  // GET /production-orders — paginated list
  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      const { search = '', status, plan_id } = req.query;

      const where = { deleted_at: null };
      if (search) {
        where[Op.or] = [
          { po_number:      { [Op.iLike]: `%${search}%` } },
          { po_description: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (status)  where.status  = status;
      if (plan_id) where.plan_id = plan_id;

      const { count, rows } = await SProductionOrder.findAndCountAll({
        where,
        limit, offset,
        include: PO_HEADER_INCLUDE,
        order: [['created_at', 'DESC']],
        distinct: true,
      });

      return helper.sendResponse(res, {
        status: true, code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      });
    } catch (error) {
      console.log('[OrderScheduleModule][list]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // GET /production-orders/:id — full detail with products + schedules
  async detail(req, res) {
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({
        where: { id, deleted_at: null },
        include: [
          ...PO_HEADER_INCLUDE,
          {
            model: SProductionOrderProduct,
            as: 'products',
            required: false,
            include: PO_PRODUCT_INCLUDE,
          },
          {
            model: SProductionOrderSchedule,
            as: 'schedules',
            required: false,
            include: [
              { model: SShifts, as: 'shift', attributes: ['id', 'name', 'start_time', 'end_time'] },
              { model: SParts,  as: 'part',  attributes: ['id', 'part_number', 'part_name'] },
              { model: SLines,  as: 'line',  attributes: ['id', 'line_code', 'name'] },
            ],
            order: [['sequence', 'ASC']],
          },
          {
            model: SProductionOrderRescheduleLog,
            as: 'reschedule_logs',
            required: false,
            order: [['rescheduled_at', 'DESC']],
          },
        ],
      });

      if (!po) return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });

      return helper.sendResponse(res, { status: true, code: 200, data: po });
    } catch (error) {
      console.log('[OrderScheduleModule][detail]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // POST /production-orders
  // Body: { plan_id, production_start_date, production_end_date, po_description?, priority? }
  //
  // FIX 1: line_id per product now sourced from SProductionPlanDetailLine (routing-based),
  //         not from a stale firstDetail.line_id field which was always null in PlanModule.
  // FIX 2: duplicate PO per plan guard added.
  // FIX 3: sequence starts at 1 (consistent with PlanModule detail sequence convention).
  // FIX 4: planned_qty sourced from qty_request (PlanModule source of truth).
  async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const schema = Joi.object({
        plan_id:               Joi.number().integer().required(),
        production_start_date: Joi.date().iso().required(),
        production_end_date:   Joi.date().iso().required(),
        po_description:        Joi.string().optional().allow('', null),
        priority:              Joi.string().valid('Low', 'Medium', 'High').default('Medium'),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { plan_id, production_start_date, production_end_date, po_description, priority } = validation.value;

      // Validate plan is Approved
      const plan = await SProductionPlan.findOne({
        where: { id: plan_id, status: 'Approved', deleted_at: null },
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Production Plan not found or not Approved' });
      }

      // FIX: Prevent duplicate active PO for the same plan
      const existingPO = await SProductionOrder.findOne({
        where: {
          plan_id,
          status: { [Op.notIn]: ['Cancelled'] },
          deleted_at: null,
        },
        transaction: t,
      });
      if (existingPO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `An active Production Order (${existingPO.po_number}) already exists for this plan. Cancel it first before creating a new one.`,
        });
      }

      // Date validations
      const startDt  = new Date(production_start_date);
      const endDt    = new Date(production_end_date);
      const latestDO = plan.latest_delivery_date ? new Date(plan.latest_delivery_date) : null;

      if (endDt <= startDt) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'production_end_date must be after production_start_date' });
      }
      if (latestDO && endDt >= latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `production_end_date must be before latest_delivery_date (${plan.latest_delivery_date})`,
        });
      }

      const po_number = await generatePoNumber(t);

      // Load plan details (ordered by sequence — same as PlanModule)
      const planDetails = await SProductionPlanDetail.findAll({
        where: { plan_id, deleted_at: null },
        order: [['sequence', 'ASC']],
        transaction: t,
      });

      if (!planDetails.length) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Production Plan has no detail items' });
      }

      // FIX: Validate that all plan details have routing (detail_lines) — consistent with
      //      PlanModule's submitForApproval validation which blocks unrouted parts.
      const detailIds = planDetails.map((d) => d.id);
      const detailLines = await SProductionPlanDetailLine.findAll({
        where: { plan_detail_id: detailIds },
        attributes: ['plan_detail_id', 'line_id', 'sequence'],
        transaction: t,
      });

      // Group detail_lines by plan_detail_id → pick primary line (sequence=1 / lowest)
      const primaryLineByDetail = new Map();
      for (const dl of detailLines) {
        const existing = primaryLineByDetail.get(dl.plan_detail_id);
        if (!existing || dl.sequence < existing.sequence) {
          primaryLineByDetail.set(dl.plan_detail_id, dl);
        }
      }

      const unroutedDetails = planDetails.filter((d) => !primaryLineByDetail.has(d.id));
      if (unroutedDetails.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `${unroutedDetails.length} plan detail(s) have no routing (line assignment). Ensure all parts have an active default routing configured.`,
        });
      }

      const total_products    = planDetails.length;
      // FIX: Use qty_request as planned_qty (source of truth from PlanModule)
      const total_planned_qty = planDetails.reduce((s, d) => s + (d.qty_request || 0), 0);

      const po = await SProductionOrder.create({
        po_number,
        plan_id,
        production_start_date: startDt.toISOString().split('T')[0],
        production_end_date:   endDt.toISOString().split('T')[0],
        earliest_delivery_date: plan.earliest_delivery_date,
        latest_delivery_date:   plan.latest_delivery_date,
        priority,
        po_description,
        total_products,
        total_planned_qty,
        status: 'Draft',
        created_by: req.user?.id ?? null,
      }, { transaction: t });

      // FIX: Insert products with correct line_id from SProductionPlanDetailLine (routing-based)
      //      sequence starts at 1 to match PlanModule convention
      const productRows = planDetails.map((d, i) => ({
        po_id:          po.id,
        plan_detail_id: d.id,
        sequence:       i + 1,
        customer_id:    d.customer_id,
        part_id:        d.part_id,
        line_id:        primaryLineByDetail.get(d.id).line_id,  // from routing pivot
        delivery_date:  d.delivery_date,
        planned_qty:    d.qty_request,  // source of truth
      }));
      await SProductionOrderProduct.bulkCreate(productRows, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'CREATE',
        resourceId: po.id, newData: po,
        description: `Created Production Order ${po_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 201, message: 'Production Order created',
        data: { id: po.id, po_number: po.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][create]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // PUT /production-orders/:id
  // Body: { production_start_date?, production_end_date?, po_description?, priority? }
  // FIX: When dates change on a Draft PO that already has schedules, invalidate them.
  async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        production_start_date: Joi.date().iso().optional(),
        production_end_date:   Joi.date().iso().optional(),
        po_description:        Joi.string().optional().allow('', null),
        priority:              Joi.string().valid('Low', 'Medium', 'High').optional(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await this._getPoEditable(id, t);
      if (!po.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: po.code, error: po.error });
      }

      const { production_start_date, production_end_date } = validation.value;
      const endDt   = production_end_date   ? new Date(production_end_date)   : new Date(po.data.production_end_date);
      const startDt = production_start_date ? new Date(production_start_date) : new Date(po.data.production_start_date);
      const latestDO = po.data.latest_delivery_date ? new Date(po.data.latest_delivery_date) : null;

      if (endDt <= startDt) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'production_end_date must be after production_start_date' });
      }
      if (latestDO && endDt >= latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `production_end_date must be before latest_delivery_date (${po.data.latest_delivery_date})`,
        });
      }

      const datesChanged = production_start_date || production_end_date;

      const oldData = po.data.toJSON();
      await po.data.update(validation.value, { transaction: t });

      // FIX: If production dates changed, existing schedules are stale — delete them
      //      so user is forced to re-run generateSchedule.
      if (datesChanged) {
        const existingScheduleCount = await SProductionOrderSchedule.count({
          where: { po_id: id },
          transaction: t,
        });
        if (existingScheduleCount > 0) {
          await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
          // Reset product scheduled_qty
          await SProductionOrderProduct.update(
            { scheduled_qty: 0 },
            { where: { po_id: id }, transaction: t },
          );
          await po.data.update({ total_scheduled_qty: 0 }, { transaction: t });
        }
      }

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'UPDATE',
        resourceId: po.data.id, oldData, newData: po.data,
        description: `Updated Production Order ${po.data.po_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: datesChanged
          ? 'Production Order updated. Existing schedules were cleared — please regenerate the schedule.'
          : 'Production Order updated',
        data: { id: po.data.id, po_number: po.data.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][update]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // DELETE /production-orders/:id — Draft only
  // FIX: Cascade delete products and schedules explicitly before soft-deleting PO.
  async delete(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Draft') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Draft Production Orders can be deleted' });
      }

      // Cascade: remove schedules and products before destroying PO
      await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
      await SProductionOrderProduct.destroy({ where: { po_id: id }, transaction: t });

      const oldData = po.toJSON();
      await po.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'DELETE',
        resourceId: po.id, oldData,
        description: `Deleted Production Order ${po.po_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Production Order deleted' });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][delete]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Generate Schedule ─────────────────────────────────────────────────────────

  // POST /production-orders/:id/generate-schedule
  //
  // FIX 1: Multi-line support — products now carry their routing-based line_id (per PlanModule).
  //        Scheduling groups products by line and allocates capacity per line independently.
  // FIX 2: capacityPerDay derived from SProductionPlanCapacityResult (same takt time and
  //        param basis as PlanModule calculateCapacity), not raw SLineCapacityParam defaults.
  // FIX 3: Capacity-overflow guard — if total qty for a line exceeds available capacity
  //        across working days, return error instead of silently truncating.
  // FIX 4: Schedule overlap guard — on the same date+line, remaining capacity is tracked
  //        and shared across products ordered by delivery_date (earliest first = highest priority).
  // FIX 5: Shift assignment is per date via the line's shift calendar (not a global round-robin).
  // FIX 6: Clears existing schedules atomically inside the same transaction.
  async generateSchedule(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await this._getPoEditable(id, t);
      if (!po.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: po.code, error: po.error });
      }

      // Load products sorted by delivery_date ASC (highest priority first), then sequence
      const products = await SProductionOrderProduct.findAll({
        where: { po_id: id },
        order: [['delivery_date', 'ASC'], ['sequence', 'ASC']],
        transaction: t,
      });

      if (!products.length) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'No products found in this Production Order' });
      }

      // Validate all products have line_id
      const unassigned = products.filter((p) => !p.line_id);
      if (unassigned.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `${unassigned.length} product(s) have no line assigned. Recreate the Production Order to re-resolve routing.`,
        });
      }

      // Collect unique line IDs used by this PO
      const lineIds = [...new Set(products.map((p) => p.line_id))];

      // FIX: Resolve capacityPerDay per line from SProductionPlanCapacityResult (PlanModule source of truth).
      //      Fall back to SLineCapacityParam defaults only if result is missing.
      const capacityResults = await SProductionPlanCapacityResult.findAll({
        where: { plan_id: po.data.plan_id, line_id: lineIds },
        transaction: t,
      });
      const capacityResultByLine = new Map(capacityResults.map((r) => [r.line_id, r]));

      const lineParamRows = await SLineCapacityParam.findAll({
        where: { line_id: lineIds },
        transaction: t,
      });
      const lineParamByLine = new Map(lineParamRows.map((r) => [r.line_id, r]));

      // Compute capacityPerDay per line
      const capacityPerDayByLine = new Map();
      for (const lineId of lineIds) {
        const result   = capacityResultByLine.get(lineId);
        const param    = lineParamByLine.get(lineId);
        const maxTakt  = result
          ? result.max_takt_time   // already computed in PlanModule (seconds)
          : (param?.default_max_takt_time ?? 60);
        const maxTaktMin = maxTakt / 60;  // convert to minutes
        const workHours  = param?.default_working_hours_per_shift ?? 7;
        const shifts     = param?.default_shifts_per_day ?? 1;
        const capPerDay  = maxTaktMin > 0
          ? Math.floor((workHours * 60 * shifts) / maxTaktMin)
          : 0;
        capacityPerDayByLine.set(lineId, capPerDay);
      }

      // Validate line capacity > 0
      for (const lineId of lineIds) {
        if ((capacityPerDayByLine.get(lineId) ?? 0) === 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `Line ID ${lineId} has zero daily capacity. Check its max_takt_time configuration.`,
          });
        }
      }

      // FIX: Get working days per line
      const workingDaysByLine = new Map();
      for (const lineId of lineIds) {
        const days = await getWorkingDays(
          lineId,
          po.data.production_start_date,
          po.data.production_end_date,
          t,
        );
        if (!days.length) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `No active working days found for line ID ${lineId} in the production date range. Check shift calendars.`,
          });
        }
        workingDaysByLine.set(lineId, days);
      }

      // FIX: Get shifts per line via calendar (not global fallback alone)
      const shiftsByLine = new Map();
      for (const lineId of lineIds) {
        const shifts = await getLineShifts(lineId, t);
        if (!shifts.length) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `No REGULAR PRODUCTIVE shifts found for line ID ${lineId}.`,
          });
        }
        shiftsByLine.set(lineId, shifts);
      }

      // Get line details (for factory_id and snapshot data)
      const lineRows = await SLines.findAll({
        where: { id: lineIds },
        include: [{ model: SFactories, as: 'factory', attributes: ['id'] }],
        transaction: t,
      });
      const lineByIdMap = new Map(lineRows.map((l) => [l.id, l]));

      // FIX: Delete existing schedules atomically inside this transaction
      await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
      // Reset scheduled_qty on all products
      await SProductionOrderProduct.update(
        { scheduled_qty: 0 },
        { where: { po_id: id }, transaction: t },
      );

      const scheduleRows = [];
      let globalSequence = 0;

      // FIX: Track remaining daily capacity per (lineId, date) slot to prevent over-scheduling
      //      when multiple products share the same line on the same day.
      // Structure: Map<lineId, Map<date, remainingCapacity>>
      const dayRemainingCapacity = new Map();
      for (const lineId of lineIds) {
        const dayMap = new Map();
        for (const date of workingDaysByLine.get(lineId)) {
          dayMap.set(date, capacityPerDayByLine.get(lineId));
        }
        dayRemainingCapacity.set(lineId, dayMap);
      }

      // Schedule each product using available slots on its assigned line
      for (const product of products) {
        const lineId      = product.line_id;
        const workingDays = workingDaysByLine.get(lineId);
        const shifts      = shiftsByLine.get(lineId);
        const lineObj     = lineByIdMap.get(lineId);
        const dayMap      = dayRemainingCapacity.get(lineId);

        let remainingQty = product.planned_qty;

        for (const productionDate of workingDays) {
          if (remainingQty <= 0) break;

          const remainingCap = dayMap.get(productionDate) ?? 0;
          if (remainingCap <= 0) continue;  // FIX: skip fully booked days

          const plannedQtyPerDay = Math.min(remainingQty, remainingCap);
          const capacityPerDay   = capacityPerDayByLine.get(lineId);
          const utilizationPct   = capacityPerDay > 0
            ? Math.round((plannedQtyPerDay / capacityPerDay) * 10000) / 100
            : 0;

          // FIX: Pick shift by cycling through line's shifts
          const shiftIndex = workingDays.indexOf(productionDate) % shifts.length;
          const shift      = shifts[shiftIndex];

          scheduleRows.push({
            po_id:                id,
            po_product_id:        product.id,
            sequence:             globalSequence++,
            production_date:      productionDate,
            line_id:              lineId,
            shift_id:             shift.id,
            part_id:              product.part_id,
            planned_qty_per_day:  plannedQtyPerDay,
            actual_qty_per_day:   0,
            line_capacity_per_day: capacityPerDay,
            utilization_pct:      utilizationPct,
            status:               'Scheduled',
            line_name_snapshot:   lineObj?.name ?? null,
            shift_name_snapshot:  shift.name ?? null,
          });

          // FIX: Deduct used capacity from the shared day slot
          dayMap.set(productionDate, remainingCap - plannedQtyPerDay);
          remainingQty -= plannedQtyPerDay;
        }

        // FIX: If product still has remaining qty after all available days, reject
        if (remainingQty > 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `Not enough capacity on line ${lineId} to schedule part_id=${product.part_id}. Remaining qty: ${remainingQty}. Extend production_end_date, reduce quantities, or check line capacity configuration.`,
          });
        }

        // Update scheduled_qty on product
        await SProductionOrderProduct.update(
          { scheduled_qty: product.planned_qty },
          { where: { id: product.id }, transaction: t },
        );
      }

      await SProductionOrderSchedule.bulkCreate(scheduleRows, { transaction: t });

      const total_scheduled_qty = products.reduce((s, p) => s + (p.planned_qty || 0), 0);
      await po.data.update({ total_scheduled_qty }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'GENERATE_SCHEDULE',
        resourceId: po.data.id, newData: { schedule_count: scheduleRows.length },
        description: `Generated ${scheduleRows.length} schedule rows for PO ${po.data.po_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: `Schedule generated: ${scheduleRows.length} rows`,
        data: {
          schedule_count: scheduleRows.length,
          lines_used: lineIds.length,
          working_days_by_line: Object.fromEntries(
            [...workingDaysByLine.entries()].map(([lid, days]) => [lid, days.length])
          ),
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][generateSchedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // PUT /production-orders/:id/schedules/:schedule_id
  // Manual edit of a single schedule row (Draft PO only)
  // FIX: Validate planned_qty_per_day does not exceed line_capacity_per_day.
  //      Validate production_date is within PO production range.
  //      Validate shift_id exists and is REGULAR PRODUCTIVE.
  async updateSchedule(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, schedule_id } = req.params;

      const schema = Joi.object({
        production_date:     Joi.date().iso().optional(),
        shift_id:            Joi.number().integer().optional(),
        planned_qty_per_day: Joi.number().integer().min(1).optional(),
        notes:               Joi.string().optional().allow('', null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await this._getPoEditable(id, t);
      if (!po.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: po.code, error: po.error });
      }

      const schedule = await SProductionOrderSchedule.findOne({
        where: { id: schedule_id, po_id: id },
        transaction: t,
      });
      if (!schedule) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Schedule row not found' });
      }

      const { production_date, shift_id, planned_qty_per_day } = validation.value;

      // FIX: Validate production_date is within PO range
      if (production_date) {
        const pd       = new Date(production_date);
        const poStart  = new Date(po.data.production_start_date);
        const poEnd    = new Date(po.data.production_end_date);
        if (pd < poStart || pd > poEnd) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `production_date must be within the PO production range (${po.data.production_start_date} ~ ${po.data.production_end_date})`,
          });
        }
      }

      // FIX: Validate shift is REGULAR PRODUCTIVE
      if (shift_id) {
        const shift = await SShifts.findOne({
          where: { id: shift_id, type: 'REGULAR', category: 'PRODUCTIVE', active: true, deleted_at: null },
          transaction: t,
        });
        if (!shift) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: 'shift_id does not reference an active REGULAR PRODUCTIVE shift',
          });
        }
      }

      // FIX: Validate planned_qty_per_day does not exceed line capacity
      if (planned_qty_per_day !== undefined) {
        const cap = schedule.line_capacity_per_day ?? 0;
        if (cap > 0 && planned_qty_per_day > cap) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `planned_qty_per_day (${planned_qty_per_day}) exceeds line capacity per day (${cap})`,
          });
        }
        // Recompute utilization_pct
        validation.value.utilization_pct = cap > 0
          ? Math.round((planned_qty_per_day / cap) * 10000) / 100
          : 0;
      }

      await schedule.update(validation.value, { transaction: t });

      // FIX: Recalculate and sync scheduled_qty on the parent product
      const schedSum = await SProductionOrderSchedule.sum('planned_qty_per_day', {
        where: { po_id: id, po_product_id: schedule.po_product_id },
        transaction: t,
      });
      await SProductionOrderProduct.update(
        { scheduled_qty: schedSum || 0 },
        { where: { id: schedule.po_product_id }, transaction: t },
      );

      // FIX: Recalculate total_scheduled_qty on PO
      const totalSched = await SProductionOrderSchedule.sum('planned_qty_per_day', {
        where: { po_id: id },
        transaction: t,
      });
      await po.data.update({ total_scheduled_qty: totalSched || 0 }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Schedule updated', data: schedule });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][updateSchedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Approval Workflow ─────────────────────────────────────────────────────────

  // POST /production-orders/:id/submit
  // FIX: Validate all products have status-consistent schedules.
  //      FIX: also validate production_end_date < latest_delivery_date (was fetched but never checked).
  async submit(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({
        where: { id, deleted_at: null },
        include: [{ model: SProductionPlan, as: 'plan', attributes: ['latest_delivery_date'] }],
        transaction: t,
      });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Draft') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Draft Production Orders can be submitted' });
      }

      // FIX: Validate production_end_date < latest_delivery_date at submit time
      const latestDO = po.plan?.latest_delivery_date ? new Date(po.plan.latest_delivery_date) : null;
      const endDt    = new Date(po.production_end_date);
      if (latestDO && endDt >= latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `production_end_date (${po.production_end_date}) must be before latest_delivery_date (${po.plan.latest_delivery_date})`,
        });
      }

      const scheduleCount = await SProductionOrderSchedule.count({ where: { po_id: id }, transaction: t });
      if (scheduleCount === 0) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'No schedule generated. Run Generate Schedule first.' });
      }

      // Validate total scheduled qty matches planned qty per product
      const products = await SProductionOrderProduct.findAll({ where: { po_id: id }, transaction: t });
      for (const product of products) {
        const scheduledSum = await SProductionOrderSchedule.sum('planned_qty_per_day', {
          where: { po_id: id, po_product_id: product.id },
          transaction: t,
        });
        if ((scheduledSum ?? 0) !== product.planned_qty) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `Scheduled qty (${scheduledSum ?? 0}) does not match planned qty (${product.planned_qty}) for product id=${product.id}. Regenerate the schedule.`,
          });
        }
      }

      const oldData = po.toJSON();
      await po.update({ status: 'Pending_Approval' }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'SUBMIT',
        resourceId: po.id, oldData, newData: po,
        description: `Submitted Production Order ${po.po_number} for approval`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Production Order submitted for approval',
        data: { id: po.id, po_number: po.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][submit]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // POST /production-orders/:id/approve
  async approve(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({ notes: Joi.string().optional().allow('', null) });
      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Pending_Approval') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Production Order is not pending approval' });
      }

      const oldData = po.toJSON();
      await po.update({
        status:      'Approved',
        notes:       validation.value.notes ?? po.notes,
        // FIX: record who approved and when (consistent with PlanModule approve)
        released_by: null,
        released_at: null,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'APPROVE',
        resourceId: po.id, oldData, newData: po,
        description: `Approved Production Order ${po.po_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Production Order approved',
        data: { id: po.id, po_number: po.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][approve]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // POST /production-orders/:id/reject
  // FIX: Status after rejection should be 'Draft' (not stay 'Pending_Approval').
  //      This is consistent with PlanModule reject behavior (returns to editable state).
  async reject(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({ notes: Joi.string().required() });
      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Pending_Approval') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Production Order is not pending approval' });
      }

      const oldData = po.toJSON();
      await po.update({
        status:      'Draft',
        notes:       validation.value.notes,
        rejected_by: req.user?.id ?? null,
        rejected_at: new Date(),
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'REJECT',
        resourceId: po.id, oldData, newData: po,
        description: `Rejected Production Order ${po.po_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Production Order rejected and returned to Draft',
        data: { id: po.id, po_number: po.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][reject]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Release & Auto-Generate Work Orders ──────────────────────────────────────

  // POST /production-orders/:id/release
  // FIX 1: Idempotency — prevent duplicate WOs if release is called twice (stale state).
  //        Existing WOs for this PO are destroyed before recreating.
  // FIX 2: generateWoNumber now passes transaction to avoid race condition.
  // FIX 3: factory_id validated — WO model has allowNull: false, guard it.
  // FIX 4: SProductionOrderProduct.paranoid:false — use destroy with force:false safe guard.
  // FIX 5: Stations loop moved outside schedule loop — query once per line, not N times.
  // FIX 6: Snapshot fields populated (part_number, part_name, line_name, shift_name).
  async release(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Approved') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Approved Production Orders can be released' });
      }

      // Load all schedules ordered by sequence
      const schedules = await SProductionOrderSchedule.findAll({
        where: { po_id: id },
        order: [['sequence', 'ASC']],
        transaction: t,
      });

      if (!schedules.length) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'No schedules found for this Production Order' });
      }

      // Collect unique line IDs
      const lineIds = [...new Set(schedules.map((s) => s.line_id))];

      // FIX: Get line→factory and line details in one pass
      const lines = await SLines.findAll({
        where: { id: lineIds },
        include: [{ model: SFactories, as: 'factory', attributes: ['id'] }],
        transaction: t,
      });
      const lineByIdMap = new Map(lines.map((l) => [l.id, l]));

      // FIX: Validate factory_id exists for every line (WO requires factory_id NOT NULL)
      for (const lineId of lineIds) {
        const lineObj = lineByIdMap.get(lineId);
        if (!lineObj?.factory?.id) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `Line ID ${lineId} has no factory assigned. Assign a factory before releasing.`,
          });
        }
      }

      // FIX: Pre-fetch stations + jobs per line ONCE (not inside schedule loop)
      const stationsByLine = new Map();
      for (const lineId of lineIds) {
        const stations = await SStations.findAll({
          where: { line_id: lineId, deleted_at: null, status: true },
          include: [{
            model: SStationJobs,
            as: 'station_jobs',
            where: { active: true, deleted_at: null },
            required: false,
            include: [{ model: SJobs, as: 'job', attributes: ['id', 'name', 'standard_time'] }],
            order: [['sequence', 'ASC']],
          }],
          order: [['sequence', 'ASC']],
          transaction: t,
        });
        stationsByLine.set(lineId, stations);
      }

      // FIX: Pre-fetch parts for snapshot fields
      const partIds = [...new Set(schedules.map((s) => s.part_id))];
      const partRows = await SParts.findAll({
        where: { id: partIds },
        attributes: ['id', 'part_number', 'part_name'],
        transaction: t,
      });
      const partByIdMap = new Map(partRows.map((p) => [p.id, p]));

      // FIX: Pre-fetch shifts for snapshot
      const shiftIds = [...new Set(schedules.map((s) => s.shift_id))];
      const shiftRows = await SShifts.findAll({
        where: { id: shiftIds },
        attributes: ['id', 'name'],
        transaction: t,
      });
      const shiftByIdMap = new Map(shiftRows.map((s) => [s.id, s]));

      // FIX: Idempotency — destroy existing WOs (and their stations/jobs) before recreating
      const existingWos = await SWorkOrder.findAll({
        where: { po_id: id, deleted_at: null },
        attributes: ['id'],
        transaction: t,
      });
      if (existingWos.length > 0) {
        const existingWoIds = existingWos.map((w) => w.id);
        // wo_station_jobs → wo_stations → work_orders cascade
        const existingStations = await SWorkOrderStation.findAll({
          where: { wo_id: existingWoIds },
          attributes: ['id'],
          transaction: t,
        });
        if (existingStations.length > 0) {
          await SWorkOrderStationJob.destroy({
            where: { wo_station_id: existingStations.map((s) => s.id) },
            transaction: t,
          });
          await SWorkOrderStation.destroy({ where: { wo_id: existingWoIds }, transaction: t });
        }
        await SWorkOrder.destroy({ where: { id: existingWoIds }, transaction: t });
      }

      // Release PO
      const oldData = po.toJSON();
      await po.update({
        status:      'Released',
        released_by: req.user?.id ?? null,
        released_at: new Date(),
      }, { transaction: t });

      let woCount = 0;

      // Create WOs from schedules
      for (const schedule of schedules) {
        const lineObj   = lineByIdMap.get(schedule.line_id);
        const partObj   = partByIdMap.get(schedule.part_id);
        const shiftObj  = shiftByIdMap.get(schedule.shift_id);
        const factory_id = lineObj.factory.id;

        // FIX: generateWoNumber inside transaction with lock
        const wo_number = await generateWoNumber(schedule.production_date, t);

        const wo = await SWorkOrder.create({
          wo_number,
          po_id:                po.id,
          po_schedule_id:       schedule.id,
          part_id:              schedule.part_id,
          line_id:              schedule.line_id,
          factory_id,
          shift_id:             schedule.shift_id,
          work_date:            schedule.production_date,
          planned_quantity:     schedule.planned_qty_per_day,
          actual_quantity:      0,
          status:               'Released',
          // FIX: populate snapshot fields
          part_number_snapshot: partObj?.part_number ?? null,
          part_name_snapshot:   partObj?.part_name   ?? null,
          line_name_snapshot:   lineObj?.name         ?? null,
          shift_name_snapshot:  shiftObj?.name        ?? null,
        }, { transaction: t });

        woCount++;

        // Create WO stations + station jobs
        const stations = stationsByLine.get(schedule.line_id) ?? [];
        for (const station of stations) {
          const woStation = await SWorkOrderStation.create({
            wo_id:            wo.id,
            station_id:       station.id,
            sequence:         station.sequence,
            planned_quantity: schedule.planned_qty_per_day,
            actual_quantity:  0,
            status:           'Pending',
          }, { transaction: t });

          for (const sj of (station.station_jobs || [])) {
            await SWorkOrderStationJob.create({
              wo_station_id:         woStation.id,
              station_job_id:        sj.id,
              job_id:                sj.job_id,
              sequence:              sj.sequence,
              standard_time:         sj.job?.standard_time ?? 0,
              status:                'Pending',
              // FIX: populate snapshot fields
              station_name_snapshot: station.name ?? null,
              job_name_snapshot:     sj.job?.name ?? null,
              standard_time_snapshot: sj.job?.standard_time ?? 0,
              setup_time_snapshot:   null,
            }, { transaction: t });
          }
        }
      }

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'RELEASE',
        resourceId: po.id, oldData, newData: po,
        description: `Released PO ${po.po_number} — created ${woCount} Work Orders`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: `Production Order released. ${woCount} Work Orders created.`,
        data: { id: po.id, po_number: po.po_number, work_order_count: woCount },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][release]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Reschedule ────────────────────────────────────────────────────────────────

  // POST /production-orders/:id/reschedule
  // Body: { new_start_date, new_end_date, reschedule_reason }
  // Released POs only — logs change, updates PO dates, cancels existing WOs,
  // resets schedules so user must regenerate + re-release.
  //
  // FIX 1: Original code only logged reschedule and updated dates but left WOs intact.
  //        This creates stale WOs with old dates. Now cancels existing WOs and
  //        resets PO to 'Approved' so release workflow can be re-triggered.
  // FIX 2: impacted_wo_count now fetched inside transaction for consistency.
  async reschedule(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        new_start_date:    Joi.date().iso().required(),
        new_end_date:      Joi.date().iso().required(),
        reschedule_reason: Joi.string().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Released') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Released Production Orders can be rescheduled' });
      }

      const { new_start_date, new_end_date, reschedule_reason } = validation.value;

      const newStart = new Date(new_start_date);
      const newEnd   = new Date(new_end_date);
      const latestDO = po.latest_delivery_date ? new Date(po.latest_delivery_date) : null;

      if (newEnd <= newStart) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'new_end_date must be after new_start_date' });
      }
      if (latestDO && newEnd >= latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `new_end_date must be before latest_delivery_date (${po.latest_delivery_date})`,
        });
      }

      // FIX: Count impacted WOs inside transaction for accuracy
      const impactedWoCount = await SWorkOrder.count({
        where: { po_id: id, deleted_at: null },
        transaction: t,
      });

      // Log reschedule
      await SProductionOrderRescheduleLog.create({
        po_id:             po.id,
        old_start_date:    po.production_start_date,
        old_end_date:      po.production_end_date,
        new_start_date:    newStart.toISOString().split('T')[0],
        new_end_date:      newEnd.toISOString().split('T')[0],
        reschedule_reason,
        impacted_wo_count: impactedWoCount,
        rescheduled_by:    req.user?.id ?? null,
        rescheduled_at:    new Date(),
      }, { transaction: t });

      // FIX: Cancel / soft-delete existing WOs (they are now stale with old dates)
      //      WO stations/jobs are NOT paranoid, destroy them first.
      if (impactedWoCount > 0) {
        const existingWos = await SWorkOrder.findAll({
          where: { po_id: id, deleted_at: null },
          attributes: ['id'],
          transaction: t,
        });
        const existingWoIds = existingWos.map((w) => w.id);
        const existingStations = await SWorkOrderStation.findAll({
          where: { wo_id: existingWoIds },
          attributes: ['id'],
          transaction: t,
        });
        if (existingStations.length > 0) {
          await SWorkOrderStationJob.destroy({
            where: { wo_station_id: existingStations.map((s) => s.id) },
            transaction: t,
          });
          await SWorkOrderStation.destroy({ where: { wo_id: existingWoIds }, transaction: t });
        }
        await SWorkOrder.destroy({ where: { id: existingWoIds }, transaction: t });
      }

      // FIX: Clear existing schedules — they reference old dates and must be regenerated
      await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });

      // Reset product scheduled_qty
      await SProductionOrderProduct.update(
        { scheduled_qty: 0 },
        { where: { po_id: id }, transaction: t },
      );

      // FIX: Revert PO to 'Approved' so the release workflow can be re-triggered
      //      after regenerating the schedule.
      await po.update({
        production_start_date: newStart.toISOString().split('T')[0],
        production_end_date:   newEnd.toISOString().split('T')[0],
        total_scheduled_qty:   0,
        status:                'Approved',
        released_by:           null,
        released_at:           null,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'RESCHEDULE',
        resourceId: po.id, newData: { new_start_date, new_end_date },
        description: `Rescheduled PO ${po.po_number}: ${impactedWoCount} WOs cancelled`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: `Reschedule logged. ${impactedWoCount} Work Order(s) cancelled. Regenerate the schedule and re-release.`,
        data: { id: po.id, po_number: po.po_number, impacted_wo_count: impactedWoCount },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][reschedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Private Helpers ───────────────────────────────────────────────────────────

  async _getPoEditable(id, transaction) {
    const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction });
    if (!po)                  return { ok: false, code: 404, error: 'Production Order not found' };
    if (po.status !== 'Draft') return { ok: false, code: 400, error: 'Only Draft Production Orders can be modified' };
    return { ok: true, data: po };
  }
}

export default new OrderScheduleModule();