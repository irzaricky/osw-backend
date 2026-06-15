import { Op, fn, col } from 'sequelize';
import Joi from 'joi';
import db from '../../models/index.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';

const {
  SWorkOrder,
  SWorkOrderStation,
  SWorkOrderProgress,
  SWorkOrderIssue,
  SWorkOrderMaterial,
  SProductionOrder,
  SProductionOrderProduct,
  SProductionOrderSchedule,
  SParts,
  SLines,
  SShifts,
  SStations,
  sequelize,
} = db;

// ─── INCLUDES ───────────────────────────────────────────────────────────────

const WO_BASE_INCLUDE = [
  { model: SProductionOrder, as: 'production_order', attributes: ['id', 'po_number'] },
  { model: SParts,           as: 'part',             attributes: ['id', 'part_number', 'part_name'] },
  { model: SLines,           as: 'line',             attributes: ['id', 'line_code', 'name'] },
  { model: SShifts,          as: 'shift',            attributes: ['id', 'name', 'start_time', 'end_time'] },
];

const WO_STATION_INCLUDE = [
  {
    model:    SWorkOrderStation,
    as:       'stations',
    required: false,
    include:  [{ model: SStations, as: 'station', attributes: ['id', 'station_code', 'name', 'sequence'] }],
    order:    [['sequence', 'ASC']],
  },
];

const ISSUE_TYPES = ['DOWNTIME', 'DEFECT', 'MATERIAL', 'OTHER', 'PAUSE'];

// ─── MODULE ─────────────────────────────────────────────────────────────────

class WorkOrderModule extends BaseModule {

  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      const { search = '', status, work_date, line_id, po_id, stage, shift_id } = req.query;

      const where = { deleted_at: null };

      if (search)   where[Op.or] = [{ wo_number: { [Op.iLike]: `%${search}%` } }];
      if (status)   where.status   = status;
      if (work_date) where.work_date = work_date;
      if (line_id)  where.line_id  = line_id;
      if (po_id)    where.po_id    = po_id;
      if (stage)    where.sequence = parseInt(stage, 10);
      if (shift_id) where.shift_id = shift_id;

      const { count, rows } = await SWorkOrder.findAndCountAll({
        where,
        limit, offset,
        include:  WO_BASE_INCLUDE,
        order:    [['sequence', 'ASC'], ['work_date', 'ASC'], ['line_id', 'ASC'], ['wo_number', 'ASC']],
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

  async dailySummary(req, res) {
    try {
      const workDate = req.query.work_date ?? new Date().toISOString().split('T')[0];
      const lineId   = req.query.line_id  ? parseInt(req.query.line_id, 10)  : null;
      const stage    = req.query.stage    ? parseInt(req.query.stage, 10)    : null;
      const shiftId  = req.query.shift_id ? parseInt(req.query.shift_id, 10) : null;

      const where = { work_date: workDate, deleted_at: null };
      if (lineId)  where.line_id  = lineId;
      if (stage)   where.sequence = stage;
      if (shiftId) where.shift_id = shiftId;

      const wos = await SWorkOrder.findAll({
        where,
        attributes: [
          'status',
          'line_id',
          'sequence',
          [fn('COUNT', col('SWorkOrder.id')), 'count'],
          [fn('SUM', col('planned_quantity')), 'total_planned'],
          [fn('SUM', col('actual_quantity')),  'total_actual'],
        ],
        group: ['status', 'line_id', 'sequence'],
        raw:   true,
      });

      const summary = {
        work_date:        workDate,
        line_id_filter:   lineId  ?? null,
        stage_filter:     stage   ?? null,
        shift_id_filter:  shiftId ?? null,
        total_wo:         0,
        status_breakdown: {},
        stage_breakdown:  {},
        lines_active:     new Set(),
        stages_active:    new Set(),
        total_planned:    0,
        total_actual:     0,
        achievement_pct:  0,
        active_issues:    0,
      };

      for (const row of wos) {
        const cnt     = parseInt(row.count, 10);
        const planned = parseInt(row.total_planned, 10) || 0;
        const actual  = parseInt(row.total_actual,  10) || 0;

        summary.total_wo      += cnt;
        summary.total_planned += planned;
        summary.total_actual  += actual;
        summary.lines_active.add(row.line_id);
        summary.stages_active.add(row.sequence);

        const statusKey = row.status;
        summary.status_breakdown[statusKey] = (summary.status_breakdown[statusKey] ?? 0) + cnt;

        const stageKey = `stage_${row.sequence}`;
        if (!summary.stage_breakdown[stageKey]) {
          summary.stage_breakdown[stageKey] = { stage: row.sequence, wo_count: 0, total_planned: 0, total_actual: 0 };
        }
        summary.stage_breakdown[stageKey].wo_count      += cnt;
        summary.stage_breakdown[stageKey].total_planned += planned;
        summary.stage_breakdown[stageKey].total_actual  += actual;
      }

      summary.lines_active    = summary.lines_active.size;
      summary.stages_active   = summary.stages_active.size;
      summary.achievement_pct = summary.total_planned > 0
        ? Math.round((summary.total_actual / summary.total_planned) * 10000) / 100
        : 0;

      const woSubqueryWhere = { work_date: workDate, deleted_at: null };
      if (lineId)  woSubqueryWhere.line_id  = lineId;
      if (stage)   woSubqueryWhere.sequence = stage;
      if (shiftId) woSubqueryWhere.shift_id = shiftId;

      const filteredWoIds = (
        await SWorkOrder.findAll({
          where:      woSubqueryWhere,
          attributes: ['id'],
          raw:        true,
        })
      ).map((w) => w.id);

      const activeIssues = filteredWoIds.length > 0
        ? await SWorkOrderIssue.count({
            where: {
              resolved_time: null,
              deleted_at:    null,
              wo_id:         { [Op.in]: filteredWoIds },
            },
          })
        : 0;

      summary.active_issues = activeIssues;

      return helper.sendResponse(res, { status: true, code: 200, data: summary });
    } catch (error) {
      console.log('[WorkOrderModule][dailySummary]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async detail(req, res) {
    try {
      const { id } = req.params;

      const wo = await SWorkOrder.findOne({
        where: { id, deleted_at: null },
        include: [
          ...WO_BASE_INCLUDE,
          ...WO_STATION_INCLUDE,
          {
            model:    SWorkOrderProgress,
            as:       'progresses',
            required: false,
            order:    [['reported_at', 'DESC']],
          },
          {
            model:    SWorkOrderIssue,
            as:       'issues',
            where:    { deleted_at: null },
            required: false,
            order:    [['reported_time', 'DESC']],
          },
          {
            model:    SWorkOrderMaterial,
            as:       'materials',
            required: false,
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

      const now = new Date();
      await wo.update({
        status:            'In_Progress',
        actual_start_time: now,
        started_at:        now,
      }, { transaction: t });

      const allStations = await SWorkOrderStation.findAll({
        where: { wo_id: id },
        order: [['sequence', 'ASC']],
        transaction: t,
      });

      if (allStations.length > 0) {
        await SWorkOrderStation.update(
          { status: 'In_Progress' },
          { where: { id: allStations[0].id }, transaction: t },
        );
        if (allStations.length > 1) {
          await SWorkOrderStation.update(
            { status: 'Pending' },
            { where: { id: allStations.slice(1).map((s) => s.id) }, transaction: t },
          );
        }
      }

      await this.logActivity(req, {
        moduleCode:  'work_order', activityCode: 'START',
        resourceId:  wo.id, newData: wo,
        description: `Started Work Order ${wo.wo_number} — line_id=${wo.line_id} stage=${wo.sequence ?? 1}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Work Order started',
        data: {
          id:                wo.id,
          wo_number:         wo.wo_number,
          line_id:           wo.line_id,
          stage:             wo.sequence,
          status:            'In_Progress',
          actual_start_time: now,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][start]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Progress ─────────────────────────────────────────────────────────────

  /**
   * POST /work-orders/:id/progresses
   * Body: { qty_good, qty_reject?, qty_scrap?, shift_end_qty?, reported_by_user_id }
   *
   * qty_good adalah jumlah unit baik pada laporan ini (bukan kumulatif).
   * cumulative_qty_good dihitung otomatis dari akumulasi seluruh progress sebelumnya.
   */
  async addProgress(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        qty_good:            Joi.number().integer().min(0).required(),
        qty_reject:          Joi.number().integer().min(0).default(0),
        qty_scrap:           Joi.number().integer().min(0).default(0),
        shift_end_qty:       Joi.number().integer().min(0).optional().allow(null),
        reported_by_user_id: Joi.number().integer().min(1).required(),
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
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Progress can only be reported on In_Progress Work Orders',
        });
      }

      const { qty_good, qty_reject, qty_scrap, shift_end_qty, reported_by_user_id } = validation.value;

      // Hitung cumulative_qty_good dari seluruh progress sebelumnya + laporan ini
      const prevCumulative = (await SWorkOrderProgress.sum('qty_good', {
        where:       { wo_id: id },
        transaction: t,
      })) || 0;

      const cumulative_qty_good = prevCumulative + qty_good;

      if (cumulative_qty_good > wo.planned_quantity) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `cumulative qty_good (${cumulative_qty_good}) melebihi planned_quantity (${wo.planned_quantity}).`,
        });
      }

      const progress = await SWorkOrderProgress.create({
        wo_id:               wo.id,
        qty_good,
        qty_reject,
        qty_scrap,
        cumulative_qty_good,
        shift_end_qty:       shift_end_qty ?? null,
        reported_by_user_id,
        reported_at:         new Date(),
      }, { transaction: t });

      await wo.update({ actual_quantity: cumulative_qty_good }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 201, message: 'Progress recorded', data: progress });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][addProgress]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async getProgresses(req, res) {
    try {
      const { id } = req.params;
      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null } });
      if (!wo) return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });

      const progresses = await SWorkOrderProgress.findAll({
        where: { wo_id: id },
        order: [['reported_at', 'DESC']],
      });

      return helper.sendResponse(res, { status: true, code: 200, data: progresses });
    } catch (error) {
      console.log('[WorkOrderModule][getProgresses]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Issues ───────────────────────────────────────────────────────────────

  /**
   * POST /work-orders/:id/issues
   * Body mencakup semua tipe issue dalam satu endpoint (issue_type sebagai pembeda).
   *
   * Tipe DOWNTIME: downtime_start, downtime_end, downtime_minutes
   * Tipe DEFECT:   defect_qty, defect_type, severity
   * Tipe PAUSE:    pause_reason, paused_by, paused_at, (resumed_by/resumed_at via resolveIssue)
   * Tipe lain:     issue_description saja
   */
  async reportIssue(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        issue_type:          Joi.string().valid(...ISSUE_TYPES).required(),
        issue_description:   Joi.string().required(),
        reported_by_user_id: Joi.number().integer().min(1).required(),
        severity:            Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional().allow(null),
        downtime_start:      Joi.date().iso().optional().allow(null),
        downtime_end:        Joi.date().iso().optional().allow(null),
        downtime_minutes:    Joi.number().integer().min(0).optional().allow(null),
        defect_qty:          Joi.number().integer().min(0).optional().allow(null),
        defect_type:         Joi.string().optional().allow('', null),
        pause_reason:        Joi.string().optional().allow('', null),
        paused_by:           Joi.string().optional().allow('', null),
        paused_at:           Joi.date().iso().optional().allow(null),
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

      const {
        downtime_start, downtime_end, reported_by_user_id,
        paused_at, ...issueData
      } = validation.value;

      let downtimeMinutes = issueData.downtime_minutes;
      if (downtime_start && downtime_end && !downtimeMinutes) {
        const ms = new Date(downtime_end) - new Date(downtime_start);
        downtimeMinutes = Math.max(0, Math.round(ms / 60000));
      }

      const issue = await SWorkOrderIssue.create({
        wo_id:               wo.id,
        ...issueData,
        downtime_start:      downtime_start  ?? null,
        downtime_end:        downtime_end    ?? null,
        downtime_minutes:    downtimeMinutes ?? null,
        paused_at:           paused_at       ?? null,
        reported_by_user_id,
        reported_time:       new Date(),
      }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 201, message: 'Issue reported', data: issue });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][reportIssue]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async getIssues(req, res) {
    try {
      const { id } = req.params;
      const { resolved } = req.query;

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

  /**
   * PUT /work-orders/:id/issues/:issue_id/resolve
   * Body: { resolution, resolved_by, resumed_by?, resumed_at?, pause_duration_minutes? }
   *
   * Untuk tipe PAUSE, field resumed_by dan resumed_at mengisi data resume.
   */
  async resolveIssue(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, issue_id } = req.params;

      const schema = Joi.object({
        resolution:              Joi.string().required(),
        resolved_by:             Joi.string().required(),
        resumed_by:              Joi.string().optional().allow('', null),
        resumed_at:              Joi.date().iso().optional().allow(null),
        pause_duration_minutes:  Joi.number().integer().min(0).optional().allow(null),
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

      const { resolution, resolved_by, resumed_by, resumed_at, pause_duration_minutes } = validation.value;

      await issue.update({
        resolution,
        resolved_by,
        resolved_time:          new Date(),
        resumed_by:             resumed_by             ?? null,
        resumed_at:             resumed_at             ?? null,
        pause_duration_minutes: pause_duration_minutes ?? null,
      }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Issue resolved', data: issue });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][resolveIssue]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Complete ─────────────────────────────────────────────────────────────

  /**
   * POST /work-orders/:id/complete
   * Body: { actual_quantity, under_production_reason? }
   *
   * Single-line completion flow:
   *   Satu WO = satu lini = satu jadwal slot. Tidak ada multi-line paralel.
   *   PO auto-complete jika SEMUA WO dalam PO sudah Completed.
   */
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

      const maxAllowed = Math.ceil(wo.planned_quantity * 1.1);
      if (actual_quantity > maxAllowed) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `actual_quantity (${actual_quantity}) exceeds 110% of planned (${wo.planned_quantity}). Max: ${maxAllowed}`,
        });
      }

      if (actual_quantity < wo.planned_quantity && !under_production_reason) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `under_production_reason is required when actual_quantity (${actual_quantity}) < planned (${wo.planned_quantity})`,
        });
      }

      const now     = new Date();
      const oldData = wo.toJSON();

      await wo.update({
        actual_quantity,
        status:          'Completed',
        actual_end_time: now,
        completed_at:    now,
      }, { transaction: t });

      // Selesaikan semua station
      await SWorkOrderStation.update(
        { status: 'Completed', actual_quantity },
        { where: { wo_id: id }, transaction: t },
      );

      const final_progress_pct = wo.planned_quantity > 0
        ? Math.min(100, Math.round((actual_quantity / wo.planned_quantity) * 10000) / 100)
        : 0;

      // Final progress entry menggunakan kolom baru
      await SWorkOrderProgress.create({
        wo_id:               wo.id,
        qty_good:            actual_quantity,
        qty_reject:          0,
        qty_scrap:           0,
        cumulative_qty_good: actual_quantity,
        reported_by_user_id: req.user?.id ?? null,
        reported_at:         now,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:  'work_order', activityCode: 'COMPLETE',
        resourceId:  wo.id, oldData, newData: wo,
        description: `Completed WO ${wo.wo_number} on line_id=${wo.line_id} — actual: ${actual_quantity}`,
        transaction: t,
      });

      // Sinkronisasi SProductionOrderSchedule
      if (wo.po_schedule_id) {
        const accumulatedActualQty = await SWorkOrder.sum('actual_quantity', {
          where: { po_schedule_id: wo.po_schedule_id, deleted_at: null },
          transaction: t,
        });

        const pendingInSchedule = await SWorkOrder.count({
          where: {
            po_schedule_id: wo.po_schedule_id,
            status:         { [Op.ne]: 'Completed' },
            deleted_at:     null,
          },
          transaction: t,
        });

        const scheduleNewStatus = pendingInSchedule === 0 ? 'Completed' : 'In_Progress';

        await SProductionOrderSchedule.update(
          {
            actual_qty_per_day: accumulatedActualQty || 0,
            status:             scheduleNewStatus,
          },
          { where: { id: wo.po_schedule_id }, transaction: t },
        );

        // Sinkronisasi SProductionOrderProduct.actual_qty
        const linkedSchedule = await SProductionOrderSchedule.findOne({
          where:      { id: wo.po_schedule_id },
          attributes: ['po_product_id'],
          transaction: t,
        });

        if (linkedSchedule?.po_product_id) {
          const allScheduleIds = (
            await SProductionOrderSchedule.findAll({
              where:      { po_product_id: linkedSchedule.po_product_id },
              attributes: ['id'],
              raw:        true,
              transaction: t,
            })
          ).map((s) => s.id);

          const productActualSum = allScheduleIds.length > 0
            ? await SWorkOrder.sum('actual_quantity', {
                where: {
                  deleted_at:     null,
                  po_schedule_id: { [Op.in]: allScheduleIds },
                },
                transaction: t,
              })
            : 0;

          await SProductionOrderProduct.update(
            { actual_qty: productActualSum || 0 },
            { where: { id: linkedSchedule.po_product_id }, transaction: t },
          );
        }
      }

      // Auto-complete PO jika semua WO sudah Completed
      const pendingWoCount = await SWorkOrder.count({
        where: {
          po_id:      wo.po_id,
          status:     { [Op.notIn]: ['Completed'] },
          deleted_at: null,
        },
        transaction: t,
      });

      if (pendingWoCount === 0) {
        await SProductionOrder.update(
          { status: 'Completed', completed_at: now },
          { where: { id: wo.po_id }, transaction: t },
        );
      }

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Work Order completed',
        data: {
          id:               wo.id,
          wo_number:        wo.wo_number,
          line_id:          wo.line_id,
          stage:            wo.sequence,
          planned_quantity: wo.planned_quantity,
          actual_quantity,
          actual_end_time:  now,
          po_completed:     pendingWoCount === 0,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][complete]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Station Status ────────────────────────────────────────────────────────

  /**
   * PUT /work-orders/:id/stations/:station_id/status
   * Body: { status }
   *
   * Menggantikan updateStationJobStatus. Karena SWorkOrderStationJob sudah tidak ada,
   * update status dilakukan langsung pada level SWorkOrderStation.
   * Enforces station sequence: station berikutnya hanya bisa aktif setelah station sebelumnya Completed.
   */
  async updateStationStatus(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, station_id } = req.params;

      const schema = Joi.object({
        status: Joi.string().valid('Pending', 'In_Progress', 'Completed').required(),
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
          error: 'Station status can only be updated on Released or In_Progress Work Orders',
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

      const { status: newStatus } = validation.value;

      // Enforce station sequence: station sebelumnya harus Completed sebelum yang ini bisa In_Progress
      if (newStatus === 'In_Progress' || newStatus === 'Completed') {
        const blockerCount = await SWorkOrderStation.count({
          where: {
            wo_id:    id,
            sequence: { [Op.lt]: station.sequence },
            status:   { [Op.ne]: 'Completed' },
          },
          transaction: t,
        });

        if (blockerCount > 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `Cannot set station to '${newStatus}': ${blockerCount} preceding station(s) are not yet Completed. Process sequence must be followed.`,
          });
        }
      }

      await station.update({ status: newStatus }, { transaction: t });

      // Jika station ini Completed, aktifkan station berikutnya (jika ada)
      if (newStatus === 'Completed') {
        const nextStation = await SWorkOrderStation.findOne({
          where: {
            wo_id:    id,
            sequence: { [Op.gt]: station.sequence },
            status:   'Pending',
          },
          order:       [['sequence', 'ASC']],
          transaction: t,
        });
        if (nextStation) {
          await nextStation.update({ status: 'In_Progress' }, { transaction: t });
        }
      }

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Station status updated',
        data: station,
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][updateStationStatus]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Materials ─────────────────────────────────────────────────────────────

  /**
   * GET /work-orders/:id/materials
   * Menampilkan daftar material kebutuhan WO beserta status ketersediaan stok.
   */
  async getMaterials(req, res) {
    try {
      const { id } = req.params;

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null } });
      if (!wo) return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });

      const materials = await SWorkOrderMaterial.findAll({
        where:   { wo_id: id },
        include: [{
          model:      SParts,
          as:         'material_part',
          attributes: ['id', 'part_number', 'part_name'],
          foreignKey: 'material_part_id',
          required:   false,
        }],
        order: [['id', 'ASC']],
      });

      return helper.sendResponse(res, { status: true, code: 200, data: materials });
    } catch (error) {
      console.log('[WorkOrderModule][getMaterials]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  /**
   * PUT /work-orders/:id/materials/:material_id/actual
   * Body: { actual_quantity }
   * Update kuantitas material aktual yang digunakan.
   */
  async updateMaterialActual(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, material_id } = req.params;

      const schema = Joi.object({
        actual_quantity: Joi.number().min(0).required(),
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
          error: 'Material actual can only be updated on Released or In_Progress Work Orders',
        });
      }

      const material = await SWorkOrderMaterial.findOne({
        where: { id: material_id, wo_id: id },
        transaction: t,
      });
      if (!material) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Material not found for this Work Order' });
      }

      await material.update({ actual_quantity: validation.value.actual_quantity }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Material actual updated', data: material });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][updateMaterialActual]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }
}

export default new WorkOrderModule();