import { Op, fn, col } from 'sequelize';
import Joi from 'joi';
import db from '../../models/index.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';

const {
  SWorkOrder,
  SWorkOrderStation,
  SWorkOrderStationJob,
  SWorkOrderProgress,
  SWorkOrderIssue,
  SProductionOrder,
  SProductionOrderProduct,
  SProductionOrderSchedule,
  SParts,
  SLines,
  SFactories,
  SShifts,
  SStations,
  SJobs,
  sequelize,
} = db;

// ─── Includes ─────────────────────────────────────────────────────────────────

const WO_BASE_INCLUDE = [
  { model: SProductionOrder, as: 'production_order', attributes: ['id', 'po_number'] },
  { model: SParts,           as: 'part',             attributes: ['id', 'part_number', 'part_name'] },
  { model: SLines,           as: 'line',             attributes: ['id', 'line_code', 'name'] },
  { model: SFactories,       as: 'factory',          attributes: ['id', 'name'] },
  { model: SShifts,          as: 'shift',            attributes: ['id', 'name', 'start_time', 'end_time'] },
];

const WO_STATION_INCLUDE = [
  {
    model: SWorkOrderStation,
    as: 'stations',
    required: false,
    include: [
      { model: SStations, as: 'station', attributes: ['id', 'station_code', 'name', 'sequence'] },
      {
        model: SWorkOrderStationJob,
        as: 'jobs',
        required: false,
        include: [{ model: SJobs, as: 'job', attributes: ['id', 'job_code', 'name', 'standard_time'] }],
        order: [['sequence', 'ASC']],
      },
    ],
    order: [['sequence', 'ASC']],
  },
];

const ISSUE_TYPES = ['DOWNTIME', 'DEFECT', 'MATERIAL', 'OTHER'];

// ─── Module ───────────────────────────────────────────────────────────────────

class WorkOrderModule extends BaseModule {

  // GET /work-orders — paginated list with optional date/status filters
  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      const { search = '', status, work_date, line_id, po_id } = req.query;

      const where = { deleted_at: null };

      if (search) {
        where[Op.or] = [
          { wo_number: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (status)    where.status    = status;
      if (work_date) where.work_date = work_date;
      if (line_id)   where.line_id   = line_id;
      if (po_id)     where.po_id     = po_id;

      const { count, rows } = await SWorkOrder.findAndCountAll({
        where,
        limit, offset,
        include: WO_BASE_INCLUDE,
        order: [['work_date', 'ASC'], ['wo_number', 'ASC']],
        distinct: true,
      });

      return helper.sendResponse(res, {
        status: true, code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      });
    } catch (error) {
      console.log('[WorkOrderModule][list]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // GET /work-orders/daily-summary?work_date=YYYY-MM-DD
  // Returns aggregated analytics for the given date (defaults to today)
  async dailySummary(req, res) {
    try {
      const workDate = req.query.work_date ?? new Date().toISOString().split('T')[0];

      const wos = await SWorkOrder.findAll({
        where: { work_date: workDate, deleted_at: null },
        attributes: [
          'status',
          [fn('COUNT', col('SWorkOrder.id')), 'count'],
          [fn('SUM', col('planned_quantity')), 'total_planned'],
          [fn('SUM', col('actual_quantity')),  'total_actual'],
        ],
        group: ['status'],
        raw: true,
      });

      const summary = {
        work_date:        workDate,
        total_wo:         0,
        status_breakdown: {},
        total_planned:    0,
        total_actual:     0,
        achievement_pct:  0,
      };

      for (const row of wos) {
        summary.total_wo      += parseInt(row.count, 10);
        summary.total_planned += parseInt(row.total_planned, 10) || 0;
        summary.total_actual  += parseInt(row.total_actual, 10)  || 0;
        summary.status_breakdown[row.status] = parseInt(row.count, 10);
      }

      summary.achievement_pct = summary.total_planned > 0
        ? Math.round((summary.total_actual / summary.total_planned) * 10000) / 100
        : 0;

      // FIX P5: active issues count — join via subquery instead of Sequelize include
      // to leverage index on s_work_orders.work_date
      const activeIssues = await SWorkOrderIssue.count({
        where: {
          resolved_time: null,
          deleted_at:    null,
          wo_id: {
            [Op.in]: sequelize.literal(
              `(SELECT id FROM s_work_orders WHERE work_date = '${workDate}' AND deleted_at IS NULL)`
            ),
          },
        },
      });

      summary.active_issues = activeIssues;

      return helper.sendResponse(res, { status: true, code: 200, data: summary });
    } catch (error) {
      console.log('[WorkOrderModule][dailySummary]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // GET /work-orders/:id — full detail with stations, jobs, progresses, issues
  async detail(req, res) {
    try {
      const { id } = req.params;

      const wo = await SWorkOrder.findOne({
        where: { id, deleted_at: null },
        include: [
          ...WO_BASE_INCLUDE,
          ...WO_STATION_INCLUDE,
          {
            model: SWorkOrderProgress,
            as: 'progresses',
            required: false,
            order: [['progress_time', 'DESC']],
          },
          {
            model: SWorkOrderIssue,
            as: 'issues',
            where: { deleted_at: null },
            required: false,
            order: [['reported_time', 'DESC']],
          },
        ],
      });

      if (!wo) return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });

      return helper.sendResponse(res, { status: true, code: 200, data: wo });
    } catch (error) {
      console.log('[WorkOrderModule][detail]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── WO Execution ─────────────────────────────────────────────────────────────

  // POST /work-orders/:id/start
  // Foreman starts the Work Order → status: Released → In_Progress
  // FIX S4: only activate the first station (lowest sequence) on start;
  //         subsequent stations remain Pending until sequence is enforced.
  async start(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!wo) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });
      }
      if (wo.status !== 'Released') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Released Work Orders can be started' });
      }

      await wo.update({ status: 'In_Progress' }, { transaction: t });

      // FIX S4: find the first station by lowest sequence; only that one goes In_Progress.
      // All others stay Pending until the active station is completed.
      const allStations = await SWorkOrderStation.findAll({
        where: { wo_id: id },
        order: [['sequence', 'ASC']],
        transaction: t,
      });

      if (allStations.length > 0) {
        const firstStation = allStations[0];
        await SWorkOrderStation.update(
          { status: 'In_Progress' },
          { where: { id: firstStation.id }, transaction: t },
        );
        // All remaining stations stay Pending (already defaulted; explicit reset for safety)
        if (allStations.length > 1) {
          const remainingIds = allStations.slice(1).map((s) => s.id);
          await SWorkOrderStation.update(
            { status: 'Pending' },
            { where: { id: remainingIds }, transaction: t },
          );
        }
      }

      await this.logActivity(req, {
        moduleCode: 'work_order', activityCode: 'START',
        resourceId: wo.id, newData: wo,
        description: `Started Work Order ${wo.wo_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Work Order started',
        data: { id: wo.id, wo_number: wo.wo_number, status: 'In_Progress' },
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][start]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Progress Reporting ────────────────────────────────────────────────────────

  // POST /work-orders/:id/progresses
  // Body: { cumulative_qty, reported_by }
  // FIX B4: cumulative_qty cannot go backward (must be >= current actual_quantity).
  // FIX B4: cumulative_qty cannot exceed planned_quantity.
  async addProgress(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        cumulative_qty: Joi.number().integer().min(0).required(),
        reported_by:    Joi.string().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!wo) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });
      }
      if (wo.status !== 'In_Progress') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Progress can only be reported on In_Progress Work Orders' });
      }

      const { cumulative_qty, reported_by } = validation.value;

      // FIX B4: prevent backward progress
      if (cumulative_qty < wo.actual_quantity) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `cumulative_qty (${cumulative_qty}) cannot be less than current actual_quantity (${wo.actual_quantity}). Progress cannot go backward.`,
        });
      }

      // FIX B4: prevent progress exceeding planned_quantity (completion must go through /complete)
      if (cumulative_qty > wo.planned_quantity) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `cumulative_qty (${cumulative_qty}) exceeds planned_quantity (${wo.planned_quantity}). Use the /complete endpoint to finalize production.`,
        });
      }

      const progress_pct = wo.planned_quantity > 0
        ? Math.min(100, Math.round((cumulative_qty / wo.planned_quantity) * 10000) / 100)
        : 0;

      const progress = await SWorkOrderProgress.create({
        wo_id:         wo.id,
        progress_time: new Date(),
        cumulative_qty,
        progress_pct,
        reported_by,
      }, { transaction: t });

      // Update actual_quantity on WO
      await wo.update({ actual_quantity: cumulative_qty }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 201, message: 'Progress recorded',
        data: progress,
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][addProgress]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // GET /work-orders/:id/progresses
  async getProgresses(req, res) {
    try {
      const { id } = req.params;

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null } });
      if (!wo) return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });

      const progresses = await SWorkOrderProgress.findAll({
        where: { wo_id: id },
        order: [['progress_time', 'DESC']],
      });

      return helper.sendResponse(res, { status: true, code: 200, data: progresses });
    } catch (error) {
      console.log('[WorkOrderModule][getProgresses]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Issue Reporting ───────────────────────────────────────────────────────────

  // POST /work-orders/:id/issues
  // Body: { issue_type, issue_description, reported_by, downtime_start?, downtime_end?,
  //         downtime_minutes?, defect_qty?, defect_type? }
  async reportIssue(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        issue_type:        Joi.string().valid(...ISSUE_TYPES).required(),
        issue_description: Joi.string().required(),
        reported_by:       Joi.string().required(),
        downtime_start:    Joi.date().iso().optional().allow(null),
        downtime_end:      Joi.date().iso().optional().allow(null),
        downtime_minutes:  Joi.number().integer().min(0).optional().allow(null),
        defect_qty:        Joi.number().integer().min(0).optional().allow(null),
        defect_type:       Joi.string().optional().allow('', null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!wo) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });
      }
      if (!['In_Progress', 'Released'].includes(wo.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Issues can only be reported on Released or In_Progress Work Orders',
        });
      }

      const { downtime_start, downtime_end, reported_by, ...issueData } = validation.value;

      // Auto-calculate downtime_minutes if both timestamps provided and not manually set
      let downtimeMinutes = issueData.downtime_minutes;
      if (downtime_start && downtime_end && !downtimeMinutes) {
        const ms = new Date(downtime_end) - new Date(downtime_start);
        downtimeMinutes = Math.max(0, Math.round(ms / 60000));
      }

      const issue = await SWorkOrderIssue.create({
        wo_id:            wo.id,
        ...issueData,
        downtime_start:   downtime_start  ?? null,
        downtime_end:     downtime_end    ?? null,
        downtime_minutes: downtimeMinutes ?? null,
        reported_by,
        reported_time:    new Date(),
      }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 201, message: 'Issue reported',
        data: issue,
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][reportIssue]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // GET /work-orders/:id/issues
  async getIssues(req, res) {
    try {
      const { id } = req.params;
      const { resolved } = req.query; // 'true' | 'false' | undefined (all)

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null } });
      if (!wo) return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });

      const where = { wo_id: id, deleted_at: null };
      if (resolved === 'true')  where.resolved_time = { [Op.ne]: null };
      if (resolved === 'false') where.resolved_time = null;

      const issues = await SWorkOrderIssue.findAll({
        where,
        order: [['reported_time', 'DESC']],
      });

      return helper.sendResponse(res, { status: true, code: 200, data: issues });
    } catch (error) {
      console.log('[WorkOrderModule][getIssues]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // PUT /work-orders/:id/issues/:issue_id/resolve
  // Body: { resolution, resolved_by }
  async resolveIssue(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, issue_id } = req.params;

      const schema = Joi.object({
        resolution:  Joi.string().required(),
        resolved_by: Joi.string().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const issue = await SWorkOrderIssue.findOne({
        where: { id: issue_id, wo_id: id, deleted_at: null },
        transaction: t,
      });
      if (!issue) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Issue not found' });
      }
      if (issue.resolved_time) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Issue is already resolved' });
      }

      await issue.update({
        resolution:    validation.value.resolution,
        resolved_by:   validation.value.resolved_by,
        resolved_time: new Date(),
      }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Issue resolved', data: issue });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][resolveIssue]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Complete Work Order ───────────────────────────────────────────────────────

  // POST /work-orders/:id/complete
  // Body: { actual_quantity, under_production_reason? (required if actual < planned) }
  //
  // FIX K1:  pendingWoCount query now runs inside transaction t to prevent race condition
  //          where two concurrent completes both see pendingWoCount > 0 and neither
  //          auto-completes the PO, or both try to complete it.
  // FIX B5:  progress_pct is calculated from actual/planned, not hardcoded 100.
  // FIX B6:  SProductionOrder.total_actual_qty is recalculated and updated on PO completion.
  // FIX D2:  SProductionOrderSchedule.actual_qty_per_day synced from wo.actual_quantity.
  // FIX D3:  SProductionOrderProduct.actual_qty recalculated as sum of all WO actual_qty
  //          for that product.
  // FIX P2:  station job bulk update replaced with single query (no N+1 loop).
  async complete(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        actual_quantity:         Joi.number().integer().min(1).required(),
        under_production_reason: Joi.string().optional().allow('', null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!wo) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });
      }
      if (wo.status !== 'In_Progress') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only In_Progress Work Orders can be completed' });
      }

      const { actual_quantity, under_production_reason } = validation.value;

      // Over-production cap: max 110% of planned
      const maxAllowed = Math.ceil(wo.planned_quantity * 1.1);
      if (actual_quantity > maxAllowed) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `actual_quantity (${actual_quantity}) exceeds 110% of planned quantity (${wo.planned_quantity}). Max allowed: ${maxAllowed}`,
        });
      }

      // Require reason for under-production
      if (actual_quantity < wo.planned_quantity && !under_production_reason) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `under_production_reason is required when actual_quantity (${actual_quantity}) is less than planned quantity (${wo.planned_quantity})`,
        });
      }

      const oldData = wo.toJSON();
      await wo.update({ actual_quantity, status: 'Completed' }, { transaction: t });

      // FIX P2: batch update all stations in one query, then batch update all station jobs
      // in one query using a subquery — eliminates N+1 loop.
      await SWorkOrderStation.update(
        { status: 'Completed', actual_quantity },
        { where: { wo_id: id }, transaction: t },
      );

      // Collect all station IDs for this WO in one query, then bulk update jobs
      const stationIds = (
        await SWorkOrderStation.findAll({
          where:       { wo_id: id },
          attributes:  ['id'],
          transaction: t,
        })
      ).map((s) => s.id);

      if (stationIds.length > 0) {
        await SWorkOrderStationJob.update(
          { status: 'Completed' },
          { where: { wo_station_id: stationIds }, transaction: t },
        );
      }

      // FIX B5: compute actual progress_pct instead of hardcoding 100
      const final_progress_pct = wo.planned_quantity > 0
        ? Math.min(100, Math.round((actual_quantity / wo.planned_quantity) * 10000) / 100)
        : 0;

      // Log final progress entry
      await SWorkOrderProgress.create({
        wo_id:          wo.id,
        progress_time:  new Date(),
        cumulative_qty: actual_quantity,
        progress_pct:   final_progress_pct,
        reported_by:    'SYSTEM (Completed)',
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'work_order', activityCode: 'COMPLETE',
        resourceId: wo.id, oldData, newData: wo,
        description: `Completed Work Order ${wo.wo_number} — actual qty: ${actual_quantity}`, transaction: t,
      });

      // FIX D2: sync actual_qty_per_day on the linked schedule row
      if (wo.po_schedule_id) {
        await SProductionOrderSchedule.update(
          { actual_qty_per_day: actual_quantity, status: 'Completed' },
          { where: { id: wo.po_schedule_id }, transaction: t },
        );
      }

      // FIX D3: recalculate SProductionOrderProduct.actual_qty by summing all
      // completed WO actual_quantity values that share the same po_product_id.
      // Resolve po_product_id via the schedule row to avoid storing redundant FK on WO.
      if (wo.po_schedule_id) {
        const linkedSchedule = await SProductionOrderSchedule.findOne({
          where:      { id: wo.po_schedule_id },
          attributes: ['po_product_id'],
          transaction: t,
        });

        if (linkedSchedule && linkedSchedule.po_product_id) {
          // Sum actual_quantity of all non-deleted WOs whose schedule belongs to this product
          const productActualSum = await SWorkOrder.sum('actual_quantity', {
            where: {
              deleted_at:      null,
              po_schedule_id: {
                [Op.in]: sequelize.literal(
                  `(SELECT id FROM s_production_order_schedules WHERE po_product_id = ${linkedSchedule.po_product_id})`
                ),
              },
            },
            transaction: t,
          });

          await SProductionOrderProduct.update(
            { actual_qty: productActualSum || 0 },
            { where: { id: linkedSchedule.po_product_id }, transaction: t },
          );
        }
      }

      // FIX K1: pendingWoCount MUST run inside transaction t.
      // Without transaction, two concurrent completes can both read the pre-commit state
      // and both see pendingWoCount > 0, so PO never gets auto-completed.
      const pendingWoCount = await SWorkOrder.count({
        where: {
          po_id:      wo.po_id,
          status:     { [Op.notIn]: ['Completed'] },
          deleted_at: null,
        },
        transaction: t,
      });

      if (pendingWoCount === 0) {
        // FIX B6: recalculate total_actual_qty from all WOs for this PO
        const totalActualQty = await SWorkOrder.sum('actual_quantity', {
          where: { po_id: wo.po_id, deleted_at: null },
          transaction: t,
        });

        await SProductionOrder.update(
          {
            status:           'Completed',
            completed_at:     new Date(),
            total_actual_qty: totalActualQty || 0,
          },
          { where: { id: wo.po_id }, transaction: t },
        );
      }

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Work Order completed',
        data: {
          id:               wo.id,
          wo_number:        wo.wo_number,
          planned_quantity: wo.planned_quantity,
          actual_quantity,
          po_completed:     pendingWoCount === 0,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][complete]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Station Job ───────────────────────────────────────────────────────────────

  // PUT /work-orders/:id/stations/:station_id/jobs/:job_id/status
  // Body: { status, actual_time? }
  //
  // FIX S5: enforce job sequence — a job cannot be moved to In_Progress or Completed
  //         unless all jobs with a lower sequence on the same station are already Completed.
  //         This prevents process sequence skip.
  async updateStationJobStatus(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, station_id, job_id } = req.params;

      const schema = Joi.object({
        status:      Joi.string().valid('Pending', 'In_Progress', 'Completed').required(),
        actual_time: Joi.number().integer().min(0).optional().allow(null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!wo) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });
      }
      if (!['Released', 'In_Progress'].includes(wo.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Station job status can only be updated on Released or In_Progress Work Orders',
        });
      }

      const station = await SWorkOrderStation.findOne({
        where: { id: station_id, wo_id: id },
        transaction: t,
      });
      if (!station) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Station not found for this Work Order' });
      }

      const job = await SWorkOrderStationJob.findOne({
        where: { id: job_id, wo_station_id: station_id },
        transaction: t,
      });
      if (!job) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Station job not found' });
      }

      const { status: newStatus } = validation.value;

      // FIX S5: if trying to advance (In_Progress or Completed), ensure all lower-sequence
      // jobs on this station are already Completed.
      if (newStatus === 'In_Progress' || newStatus === 'Completed') {
        const blockerCount = await SWorkOrderStationJob.count({
          where: {
            wo_station_id: station_id,
            sequence:      { [Op.lt]: job.sequence },
            status:        { [Op.ne]: 'Completed' },
          },
          transaction: t,
        });

        if (blockerCount > 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `Cannot set job to '${newStatus}': ${blockerCount} preceding job(s) on this station are not yet Completed. Process sequence must be followed.`,
          });
        }
      }

      await job.update(validation.value, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Station job status updated',
        data: job,
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][updateStationJobStatus]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }
}

export default new WorkOrderModule();