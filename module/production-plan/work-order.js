import { Op, fn, col, literal } from 'sequelize';
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
    model:    SWorkOrderStation,
    as:       'stations',
    required: false,
    include: [
      { model: SStations, as: 'station', attributes: ['id', 'station_code', 'name', 'sequence'] },
      {
        model:    SWorkOrderStationJob,
        as:       'jobs',
        required: false,
        include:  [{ model: SJobs, as: 'job', attributes: ['id', 'job_code', 'name', 'standard_time'] }],
        order:    [['sequence', 'ASC']],
      },
    ],
    order: [['sequence', 'ASC']],
  },
];

const ISSUE_TYPES = ['DOWNTIME', 'DEFECT', 'MATERIAL', 'OTHER'];

// ─── Module ───────────────────────────────────────────────────────────────────

class WorkOrderModule extends BaseModule {

  // ── List ──────────────────────────────────────────────────────────────────────

  /**
   * GET /work-orders
   * Query: search, status, work_date, line_id, po_id, stage, shift_id
   *
   * Supports filter by line_id, stage (sequence), dan shift_id.
   * [PERUBAHAN #3] Tambahan parameter filter opsional `shift_id`.
   * Jika shift_id dikirim, Work Order akan difilter berdasarkan shift tersebut.
   * Results are ordered by stage → date → line → wo_number to reflect execution order.
   */
  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      // [PERUBAHAN #3] Tambahkan destructuring `shift_id` dari req.query
      const { search = '', status, work_date, line_id, po_id, stage, shift_id } = req.query;

      const where = { deleted_at: null };

      if (search)    where[Op.or] = [{ wo_number: { [Op.iLike]: `%${search}%` } }];
      if (status)    where.status    = status;
      if (work_date) where.work_date = work_date;
      if (line_id)   where.line_id   = line_id;
      if (po_id)     where.po_id     = po_id;
      // `sequence` on WO = stage order from the parallel-sequential scheduler
      // Filter by stage to see only WOs belonging to a specific production stage
      if (stage)     where.sequence  = parseInt(stage, 10);
      // [PERUBAHAN #3] Filter berdasarkan shift_id jika dikirim oleh klien
      if (shift_id)  where.shift_id  = shift_id;

      const { count, rows } = await SWorkOrder.findAndCountAll({
        where,
        limit, offset,
        include:  WO_BASE_INCLUDE,
        // Sort by stage first so stage-sequential WOs are visually grouped,
        // then by date and line within each stage
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

  // ── Daily Summary ─────────────────────────────────────────────────────────────

  /**
   * GET /work-orders/daily-summary?work_date=YYYY-MM-DD[&line_id=N][&stage=N][&shift_id=N]
   *
   * Aggregated analytics for the given date.
   * [PERUBAHAN #1] activeIssues menggunakan subquery Sequelize yang aman (anti SQL Injection)
   *               dan kini juga memfilter berdasarkan `stage` (sequence) jika dikirim.
   * [PERUBAHAN #3] Tambahan filter opsional shift_id.
   */
  async dailySummary(req, res) {
    try {
      const workDate = req.query.work_date ?? new Date().toISOString().split('T')[0];
      const lineId   = req.query.line_id  ? parseInt(req.query.line_id, 10)  : null;
      const stage    = req.query.stage    ? parseInt(req.query.stage, 10)    : null;
      // [PERUBAHAN #3] Ambil shift_id dari query params
      const shiftId  = req.query.shift_id ? parseInt(req.query.shift_id, 10) : null;

      const where = { work_date: workDate, deleted_at: null };
      if (lineId)  where.line_id  = lineId;
      if (stage)   where.sequence = stage;
      // [PERUBAHAN #3] Tambahkan kondisi shift_id jika ada
      if (shiftId) where.shift_id = shiftId;

      const wos = await SWorkOrder.findAll({
        where,
        attributes: [
          'status',
          'line_id',
          'sequence',   // stage order — included so stage_breakdown can be built
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
        // [PERUBAHAN #3] Sertakan shift_id_filter di output summary agar klien tahu filter yang aktif
        shift_id_filter:  shiftId ?? null,
        total_wo:         0,
        status_breakdown: {},
        stage_breakdown:  {},   // Map<stage, { wo_count, total_planned, total_actual }>
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

        // Stage breakdown: aggregate across all statuses per stage
        const stageKey = `stage_${row.sequence}`;
        if (!summary.stage_breakdown[stageKey]) {
          summary.stage_breakdown[stageKey] = { stage: row.sequence, wo_count: 0, total_planned: 0, total_actual: 0 };
        }
        summary.stage_breakdown[stageKey].wo_count      += cnt;
        summary.stage_breakdown[stageKey].total_planned += planned;
        summary.stage_breakdown[stageKey].total_actual  += actual;
      }

      summary.lines_active       = summary.lines_active.size;
      summary.stages_active      = summary.stages_active.size;
      summary.achievement_pct    = summary.total_planned > 0
        ? Math.round((summary.total_actual / summary.total_planned) * 10000) / 100
        : 0;

      // ─────────────────────────────────────────────────────────────────────────
      // [PERUBAHAN #1] Perbaikan SQL Injection pada query activeIssues.
      //
      // SEBELUM (TIDAK AMAN — string interpolation langsung):
      //   sequelize.literal(
      //     `(SELECT id FROM s_work_orders WHERE work_date = '${workDate}'
      //       AND deleted_at IS NULL${lineId ? ` AND line_id = ${lineId}` : ''})`
      //   )
      //
      // SESUDAH (AMAN — menggunakan subquery Sequelize ORM dengan parameter binding):
      //   Subquery dibangun secara programatik menggunakan objek `where` yang
      //   sudah aman, kemudian di-wrap menggunakan `literal` dari hasil
      //   findAll yang hanya mengambil `id`. Pendekatan ini sepenuhnya
      //   memanfaatkan parameterisasi bawaan Sequelize (dialect escape) dan
      //   tidak ada nilai user-supplied yang diinterpolasi langsung ke string SQL.
      //
      // [PERUBAHAN #1b] Filter `stage` (sequence) kini juga dimasukkan ke dalam
      //   kondisi pencarian activeIssues agar data issues yang dihitung konsisten
      //   dengan filter stage yang diterapkan pada summary di atas.
      // ─────────────────────────────────────────────────────────────────────────

      // Bangun kondisi WHERE untuk subquery WO secara aman melalui ORM
      const woSubqueryWhere = {
        work_date:  workDate,
        deleted_at: null,
      };
      // Sertakan semua filter aktif agar hasil issues sinkron dengan summary
      if (lineId)  woSubqueryWhere.line_id  = lineId;
      if (stage)   woSubqueryWhere.sequence = stage;
      if (shiftId) woSubqueryWhere.shift_id = shiftId;

      // Ambil daftar ID Work Order yang sesuai filter, lalu gunakan sebagai
      // daftar `wo_id` yang valid untuk menghitung issue aktif.
      // Ini menghindari raw SQL literal sepenuhnya.
      const filteredWoIds = (
        await SWorkOrder.findAll({
          where:      woSubqueryWhere,
          attributes: ['id'],
          raw:        true,
        })
      ).map((w) => w.id);

      // Hitung issue aktif hanya dari WO yang ada dalam daftar filteredWoIds
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

  // ── Detail ────────────────────────────────────────────────────────────────────

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
            order:    [['progress_time', 'DESC']],
          },
          {
            model:    SWorkOrderIssue,
            as:       'issues',
            where:    { deleted_at: null },
            required: false,
            order:    [['reported_time', 'DESC']],
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

  // ── Start ─────────────────────────────────────────────────────────────────────

  /**
   * POST /work-orders/:id/start
   * Released → In_Progress.
   *
   * Only the first station (lowest sequence) on this WO's line is activated.
   * Subsequent stations remain Pending until each active station is completed —
   * this enforces the routing sequence within the line.
   */
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

      const allStations = await SWorkOrderStation.findAll({
        where: { wo_id: id },
        order: [['sequence', 'ASC']],
        transaction: t,
      });

      if (allStations.length > 0) {
        // Activate only the first station; all others stay Pending
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
        moduleCode: 'work_order', activityCode: 'START',
        resourceId: wo.id, newData: wo,
        description: `Started Work Order ${wo.wo_number} — line_id=${wo.line_id} stage=${wo.sequence ?? 1}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Work Order started',
        data: {
          id:        wo.id,
          wo_number: wo.wo_number,
          line_id:   wo.line_id,
          stage:     wo.sequence,   // stage order from parallel-sequential model
          status:    'In_Progress',
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][start]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Progress ──────────────────────────────────────────────────────────────────

  /**
   * POST /work-orders/:id/progresses
   * Body: { cumulative_qty, reported_by }
   *
   * cumulative_qty cannot go backward, cannot exceed planned_quantity.
   */
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

      if (cumulative_qty < wo.actual_quantity) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `cumulative_qty (${cumulative_qty}) cannot be less than current actual_quantity (${wo.actual_quantity}). Progress cannot go backward.`,
        });
      }
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

      await wo.update({ actual_quantity: cumulative_qty }, { transaction: t });

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
        order: [['progress_time', 'DESC']],
      });

      return helper.sendResponse(res, { status: true, code: 200, data: progresses });
    } catch (error) {
      console.log('[WorkOrderModule][getProgresses]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Issues ────────────────────────────────────────────────────────────────────

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

  // ── Complete ──────────────────────────────────────────────────────────────────

  /**
   * POST /work-orders/:id/complete
   * Body: { actual_quantity, under_production_reason? }
   *
   * PARALLEL-SEQUENTIAL COMPLETION FLOW:
   *   Each WO is bound to exactly one line in one stage. Completing a WO on line A
   *   at stage 1 does not affect WOs on line B (same stage, parallel) or any
   *   stage-2 WOs. The PO is auto-completed only when ALL WOs across ALL lines
   *   and ALL stages are Completed.
   *
   * [PERUBAHAN #2a] Sinkronisasi status SProductionOrderSchedule:
   *   Status schedule TIDAK langsung di-set ke 'Completed' hanya karena satu WO selesai.
   *   Schedule baru menjadi 'Completed' jika SELURUH WO yang terikat pada po_schedule_id
   *   yang sama sudah berstatus 'Completed'. Jika masih ada WO lain yang belum selesai,
   *   status schedule tetap pada status sebelumnya (misal 'In_Progress').
   *
   * [PERUBAHAN #2b] Sinkronisasi actual_qty_per_day pada SProductionOrderSchedule:
   *   Nilai actual_qty_per_day TIDAK langsung di-overwrite dengan actual_quantity dari
   *   satu WO. Melainkan, dihitung akumulasi SUM dari actual_quantity seluruh WO yang
   *   memiliki po_schedule_id yang sama, untuk mendukung skenario multi-shift / paralel.
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

      // Over-production cap: max 110% of planned
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

      const oldData = wo.toJSON();
      await wo.update({ actual_quantity, status: 'Completed' }, { transaction: t });

      // Batch update all stations and their jobs in two queries (no N+1 loop)
      await SWorkOrderStation.update(
        { status: 'Completed', actual_quantity },
        { where: { wo_id: id }, transaction: t },
      );

      const stationIds = (
        await SWorkOrderStation.findAll({
          where:      { wo_id: id },
          attributes: ['id'],
          transaction: t,
        })
      ).map((s) => s.id);

      if (stationIds.length > 0) {
        await SWorkOrderStationJob.update(
          { status: 'Completed' },
          { where: { wo_station_id: stationIds }, transaction: t },
        );
      }

      const final_progress_pct = wo.planned_quantity > 0
        ? Math.min(100, Math.round((actual_quantity / wo.planned_quantity) * 10000) / 100)
        : 0;

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
        description: `Completed WO ${wo.wo_number} on line_id=${wo.line_id} — actual: ${actual_quantity}`, transaction: t,
      });

      // ─────────────────────────────────────────────────────────────────────────
      // [PERUBAHAN #2] Sinkronisasi SProductionOrderSchedule dengan logika yang benar.
      // ─────────────────────────────────────────────────────────────────────────
      if (wo.po_schedule_id) {

        // [PERUBAHAN #2b] Hitung akumulasi actual_quantity dari SELURUH WO
        // yang terikat pada po_schedule_id yang sama (termasuk WO yang baru saja selesai).
        // Ini mendukung skenario multi-shift atau paralel WO dalam satu schedule.
        const accumulatedActualQty = await SWorkOrder.sum('actual_quantity', {
          where: {
            po_schedule_id: wo.po_schedule_id,
            deleted_at:     null,
          },
          transaction: t,
        });

        // [PERUBAHAN #2a] Cek apakah masih ada WO lain yang belum Completed
        // pada po_schedule_id yang sama. Status schedule hanya menjadi 'Completed'
        // jika TIDAK ADA LAGI WO yang tersisa (pendingInSchedule === 0).
        const pendingInSchedule = await SWorkOrder.count({
          where: {
            po_schedule_id: wo.po_schedule_id,
            status:         { [Op.ne]: 'Completed' },
            deleted_at:     null,
          },
          transaction: t,
        });

        // Tentukan status schedule: 'Completed' hanya jika semua WO sudah selesai,
        // 'In_Progress' jika masih ada WO yang berjalan.
        const scheduleNewStatus = pendingInSchedule === 0 ? 'Completed' : 'In_Progress';

        await SProductionOrderSchedule.update(
          {
            // Gunakan total akumulasi, bukan langsung actual_quantity dari satu WO
            actual_qty_per_day: accumulatedActualQty || 0,
            status:             scheduleNewStatus,
          },
          { where: { id: wo.po_schedule_id }, transaction: t },
        );
      }

      // Recalculate SProductionOrderProduct.actual_qty by summing ALL WO actuals
      // for the same po_product_id (spans multiple lines if multi-line product)
      if (wo.po_schedule_id) {
        const linkedSchedule = await SProductionOrderSchedule.findOne({
          where:      { id: wo.po_schedule_id },
          attributes: ['po_product_id'],
          transaction: t,
        });

        if (linkedSchedule?.po_product_id) {
          // Hitung total actual dari seluruh WO yang terikat schedule
          // di bawah po_product_id yang sama (aman menggunakan subquery ORM)
          const allScheduleIdsForProduct = (
            await SProductionOrderSchedule.findAll({
              where:      { po_product_id: linkedSchedule.po_product_id },
              attributes: ['id'],
              raw:        true,
              transaction: t,
            })
          ).map((s) => s.id);

          const productActualSum = allScheduleIdsForProduct.length > 0
            ? await SWorkOrder.sum('actual_quantity', {
                where: {
                  deleted_at:     null,
                  po_schedule_id: { [Op.in]: allScheduleIdsForProduct },
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

      // Auto-complete the PO when ALL WOs (across ALL lines) are Completed
      // Must run inside transaction to prevent concurrent race condition
      const pendingWoCount = await SWorkOrder.count({
        where: {
          po_id:      wo.po_id,
          status:     { [Op.notIn]: ['Completed'] },
          deleted_at: null,
        },
        transaction: t,
      });

      if (pendingWoCount === 0) {
        // total_actual_qty must count FINAL product units, not line-operation units.
        // Each po_product row is per (plan_detail × line); parallel lines each record
        // their own actual_qty but they all contribute to the same final unit count.
        // MIN(actual_qty) per plan_detail = bottleneck line = real final unit output.
        // SUM of those per-detail MINs = total final units actually produced.
        const perDetailActuals = await SProductionOrderProduct.findAll({
          where:      { po_id: wo.po_id },
          attributes: ['plan_detail_id', [fn('MIN', col('actual_qty')), 'min_actual']],
          group:      ['plan_detail_id'],
          raw:        true,
          transaction: t,
        });
        const totalActualQty = perDetailActuals.reduce(
          (sum, row) => sum + (parseInt(row.min_actual, 10) || 0), 0
        );

        await SProductionOrder.update(
          {
            status:           'Completed',
            completed_at:     new Date(),
            total_actual_qty: totalActualQty,
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
          line_id:          wo.line_id,
          stage:            wo.sequence,   // stage order from parallel-sequential model
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

  // ── Station Job Status ────────────────────────────────────────────────────────

  /**
   * PUT /work-orders/:id/stations/:station_id/jobs/:job_id/status
   * Body: { status, actual_time? }
   *
   * Enforces job sequence within a station — a job cannot advance to In_Progress
   * or Completed unless all lower-sequence jobs on the same station are Completed.
   */
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

      // Enforce job sequence: all preceding jobs on this station must be Completed
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

  // ── Scan Operator ─────────────────────────────────────────────────────────────

  /**
   * [FITUR BARU #4] POST /work-orders/:id/stations/:station_id/jobs/:job_id/scan-operator
   * Body: { operator_id }
   *
   * Endpoint untuk assignasi operator ke job tertentu melalui mekanisme scan (QR/barcode).
   * Alur:
   *   1. Validasi WO ada dan statusnya Released atau In_Progress.
   *   2. Validasi Job ada pada stasiun yang dimaksud.
   *   3. Sequence Enforcer: semua job dengan sequence lebih rendah harus sudah Completed.
   *   4. Update operator_id pada job tersebut.
   *   5. Jika status job masih Pending, otomatis ubah ke In_Progress (operator mulai bekerja).
   *      Jika sudah In_Progress, biarkan (operator hanya mengganti/assign ulang).
   *   6. Catat log aktivitas dan kembalikan data job terbaru.
   */
  async scanOperator(req, res) {
    const t = await sequelize.transaction();
    try {
      // a. Ambil parameter dari req.params dan req.body
      const { id, station_id, job_id } = req.params;

      // b. Validasi Joi — operator_id wajib diisi
      const schema = Joi.object({
        operator_id: Joi.number().integer().min(1).required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { operator_id } = validation.value;

      // c. Pastikan Work Order ada dan statusnya Released atau In_Progress
      const wo = await SWorkOrder.findOne({
        where: { id, deleted_at: null },
        transaction: t,
      });

      if (!wo) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 404,
          error: 'Work Order not found',
        });
      }

      if (!['Released', 'In_Progress'].includes(wo.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `Operator can only be assigned on Released or In_Progress Work Orders. Current status: '${wo.status}'`,
        });
      }

      // d. Ambil data SWorkOrderStationJob berdasarkan job_id dan station_id
      const job = await SWorkOrderStationJob.findOne({
        where: {
          id:            job_id,
          wo_station_id: station_id,
        },
        transaction: t,
      });

      if (!job) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 404,
          error: 'Station job not found for the given station',
        });
      }

      // e. Sequence Enforcer: pastikan semua job dengan sequence lebih rendah
      //    di stasiun yang sama sudah berstatus 'Completed'.
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
          error: `Cannot assign operator: ${blockerCount} preceding job(s) on this station are not yet Completed. Process sequence must be followed.`,
        });
      }

      // f. Update job: set operator_id dan ubah status jika masih Pending.
      //    Jika status saat ini 'Pending' → otomatis jadikan 'In_Progress'
      //    (operator scan = tanda mulai mengeksekusi tugas tersebut).
      //    Jika status sudah 'In_Progress' → biarkan (mungkin ganti operator di tengah jalan).
      const newJobStatus = job.status === 'Pending' ? 'In_Progress' : job.status;

      await job.update(
        {
          operator_id,
          status: newJobStatus,
        },
        { transaction: t },
      );

      // h. Catat log aktivitas — format parameter mengikuti method lain di modul ini
      await this.logActivity(req, {
        moduleCode:  'work_order',
        activityCode: 'SCAN_OPERATOR',
        resourceId:  wo.id,
        newData:     job,
        description: `Operator ID ${operator_id} assigned to Job ID ${job_id} (Station ID ${station_id}) on WO ${wo.wo_number} — job status: ${newJobStatus}`,
        transaction: t,
      });

      await t.commit();

      // i. Kembalikan data job terbaru yang berhasil diupdate
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: 'Operator assigned successfully',
        data: job,
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][scanOperator]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }
}

export default new WorkOrderModule();