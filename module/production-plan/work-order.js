import { Op, fn, col, literal } from 'sequelize';
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
  TWarehouseStockLog,
  sequelize,
} = db;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ISSUE_TYPES = ['DOWNTIME', 'DEFECT', 'MATERIAL', 'OTHER', 'PAUSE'];

// ─── INCLUDES ────────────────────────────────────────────────────────────────

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

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function buildProgressPayload({ woStationId, qtyGood, qtyReject, qtyScrap, cumulativeQty, plannedQty, reportedBy, now }) {
  const progressPct = plannedQty > 0
    ? Math.round((cumulativeQty / plannedQty) * 10000) / 100
    : 0;
  return {
    wo_station_id:       woStationId,
    qty_good:            qtyGood,
    qty_reject:          qtyReject,
    qty_scrap:           qtyScrap,
    cumulative_qty:      cumulativeQty,
    cumulative_qty_good: cumulativeQty,
    progress_pct:        progressPct,
    reported_by:         reportedBy ?? null,
    progress_time:       now,
    reported_at:         now,
  };
}

// ─── MODULE ──────────────────────────────────────────────────────────────────

class WorkOrderModule extends BaseModule {

  // ── WO Line: List ─────────────────────────────────────────────────────────

  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      const { search = '', status, work_date, start_date, end_date, line_id, po_id, stage, shift_id } = req.query;

      const where = { deleted_at: null };

      if (search) where[Op.or] = [{ wo_number: { [Op.iLike]: `%${search}%` } }];
      if (status) where.status = status;

      if (start_date && end_date) {
        where.work_date = { [Op.between]: [start_date, end_date] };
      } else if (start_date) {
        where.work_date = { [Op.gte]: start_date };
      } else if (end_date) {
        where.work_date = { [Op.lte]: end_date };
      } else if (work_date) {
        where.work_date = work_date;
      }

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

  // ── WO Line: Daily Summary ────────────────────────────────────────────────

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
          'id', 'status', 'line_id', 'sequence',
          [fn('COUNT', col('SWorkOrder.id')), 'count'],
          [fn('SUM', col('planned_quantity')), 'total_planned'],
          [fn('SUM', col('actual_quantity')),  'total_actual'],
        ],
        group: ['SWorkOrder.id', 'status', 'line_id', 'sequence'],
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

      const woIds = [];

      for (const row of wos) {
        const cnt     = parseInt(row.count, 10);
        const planned = parseInt(row.total_planned, 10) || 0;
        const actual  = parseInt(row.total_actual,  10) || 0;

        summary.total_wo      += cnt;
        summary.total_planned += planned;
        summary.total_actual  += actual;
        summary.lines_active.add(row.line_id);
        summary.stages_active.add(row.sequence);
        woIds.push(row.id);

        summary.status_breakdown[row.status] = (summary.status_breakdown[row.status] ?? 0) + cnt;

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

      // Count open issues across all stations of all WOs for this date
      if (woIds.length > 0) {
        const stationIds = (await SWorkOrderStation.findAll({
          where:      { wo_id: { [Op.in]: woIds } },
          attributes: ['id'],
          raw:        true,
        })).map((s) => s.id);

        summary.active_issues = stationIds.length > 0
          ? await SWorkOrderIssue.count({
              where: { resolved_time: null, deleted_at: null, wo_station_id: { [Op.in]: stationIds } },
            })
          : 0;
      }

      return helper.sendResponse(res, { status: true, code: 200, data: summary });
    } catch (error) {
      console.log('[WorkOrderModule][dailySummary]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── WO Line: Detail ───────────────────────────────────────────────────────

  async detail(req, res) {
    try {
      const { id } = req.params;

      const wo = await SWorkOrder.findOne({
        where:   { id, deleted_at: null },
        include: [
          ...WO_BASE_INCLUDE,
          {
            model:    SWorkOrderStation,
            as:       'stations',
            required: false,
            include:  [{ model: SStations, as: 'station', attributes: ['id', 'station_code', 'name', 'sequence'] }],
            order:    [['sequence', 'ASC']],
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

  // ── WO Station: Detail ────────────────────────────────────────────────────

  async stationDetail(req, res) {
    try {
      const { id, station_id } = req.params;

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null } });
      if (!wo) return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });

      const station = await SWorkOrderStation.findOne({
        where:   { id: station_id, wo_id: id },
        include: [
          { model: SStations, as: 'station', attributes: ['id', 'station_code', 'name', 'sequence'] },
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
            include:  [{ model: SParts, as: 'material_part', attributes: ['id', 'part_number', 'part_name'] }],
          },
        ],
      });

      if (!station) return helper.sendResponse(res, { status: false, code: 404, error: 'Station not found for this Work Order' });

      return helper.sendResponse(res, {
        status: true, code: 200,
        data: { wo: { id: wo.id, wo_number: wo.wo_number, planned_quantity: wo.planned_quantity, status: wo.status }, station },
      });
    } catch (error) {
      console.log('[WorkOrderModule][stationDetail]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── WO Line: Check Materials (aggregate across all stations) ──────────────

  async checkMaterials(req, res) {
    try {
      const { id } = req.params;

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null } });
      if (!wo) return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });
      if (wo.status !== 'Released') {
        return helper.sendResponse(res, { status: false, code: 400, error: 'Material check is only available for Released Work Orders' });
      }

      const stations = await SWorkOrderStation.findAll({
        where: { wo_id: id },
        attributes: ['id'],
        raw: true,
      });

      if (stations.length === 0) {
        return helper.sendResponse(res, {
          status: true, code: 200,
          data: { wo_id: wo.id, wo_number: wo.wo_number, materials: [], shortage_count: 0, all_sufficient: true },
        });
      }

      const stationIds = stations.map((s) => s.id);

      const materials = await SWorkOrderMaterial.findAll({
        where:   { wo_station_id: { [Op.in]: stationIds } },
        include: [{ model: SParts, as: 'material_part', attributes: ['id', 'part_number', 'part_name'] }],
        order:   [['id', 'ASC']],
      });

      const partIds   = [...new Set(materials.map((m) => m.material_part_id))];
      const stockRows = await TWarehouseStockLog.findAll({
        where:      { part_id: partIds, deleted_at: null },
        attributes: [
          'part_id',
          [fn('SUM', literal('CASE WHEN is_placement = true THEN qty_per_kanban ELSE -qty_per_kanban END')), 'current_stock'],
        ],
        group: ['part_id'],
        raw:   true,
      });

      const stockMap = Object.fromEntries(stockRows.map((r) => [r.part_id, parseFloat(r.current_stock) || 0]));

      // Aggregate planned_quantity per part across all stations
      const partAgg = {};
      for (const m of materials) {
        if (!partAgg[m.material_part_id]) {
          partAgg[m.material_part_id] = { material_part: m.material_part, total_planned: 0 };
        }
        partAgg[m.material_part_id].total_planned += parseFloat(m.planned_quantity);
      }

      const result = Object.entries(partAgg).map(([partId, agg]) => {
        const currentStock = stockMap[partId] ?? 0;
        const shortage     = Math.max(0, agg.total_planned - currentStock);
        return {
          material_part_id: parseInt(partId, 10),
          material_part:    agg.material_part,
          total_planned:    agg.total_planned,
          current_stock:    currentStock,
          shortage,
          sufficient:       shortage === 0,
        };
      });

      const shortageItems = result.filter((r) => !r.sufficient);

      return helper.sendResponse(res, {
        status: true, code: 200,
        data: {
          wo_id:          wo.id,
          wo_number:      wo.wo_number,
          materials:      result,
          shortage_count: shortageItems.length,
          all_sufficient: shortageItems.length === 0,
        },
      });
    } catch (error) {
      console.log('[WorkOrderModule][checkMaterials]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── WO Line: Start ────────────────────────────────────────────────────────

  async start(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        force_start:   Joi.boolean().default(false),
        shortage_note: Joi.string().optional().allow('', null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { force_start, shortage_note } = validation.value;

      const wo = await SWorkOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!wo) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Work Order not found' });
      }
      if (wo.status !== 'Released') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Released Work Orders can be started' });
      }

      const allStations = await SWorkOrderStation.findAll({
        where: { wo_id: id },
        order: [['sequence', 'ASC']],
        transaction: t,
      });

      // Aggregate materials from all stations for shortage check
      const stationIds = allStations.map((s) => s.id);
      const materials  = stationIds.length > 0
        ? await SWorkOrderMaterial.findAll({ where: { wo_station_id: { [Op.in]: stationIds } }, transaction: t })
        : [];

      const shortages = materials.filter((m) => parseFloat(m.actual_quantity ?? 0) < parseFloat(m.planned_quantity));
      if (shortages.length > 0 && !force_start) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 422,
          error:  'Insufficient materials. Set force_start=true to proceed anyway.',
          data: {
            shortages: shortages.map((m) => ({
              material_part_id: m.material_part_id,
              planned_quantity: m.planned_quantity,
              actual_quantity:  m.actual_quantity,
            })),
          },
        });
      }

      const now = new Date();
      await wo.update({ status: 'In_Progress', actual_start_time: now }, { transaction: t });

      // All stations go In_Progress simultaneously (assembly line model)
      if (allStations.length > 0) {
        await SWorkOrderStation.update(
          { status: 'In_Progress', started_at: now },
          { where: { wo_id: id }, transaction: t },
        );
      }

      if (shortages.length > 0 && force_start) {
        const firstStation = allStations[0];
        await SWorkOrderIssue.create({
          wo_station_id:     firstStation?.id ?? null,
          issue_type:        'MATERIAL',
          issue_description: shortage_note || `WO started with ${shortages.length} material shortage(s). Foreman acknowledged.`,
          reported_by:       req.user?.id ?? null,
          reported_time:     now,
        }, { transaction: t });
      }

      await this.logActivity(req, {
        moduleCode:  'work_order', activityCode: 'START',
        resourceId:  wo.id, newData: wo,
        description: `Started WO ${wo.wo_number} — line_id=${wo.line_id}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Work Order started',
        data: {
          id:                wo.id,
          wo_number:         wo.wo_number,
          status:            'In_Progress',
          actual_start_time: now,
          shortage_recorded: shortages.length > 0 && force_start,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][start]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── WO Station: Complete ──────────────────────────────────────────────────

  async completeStation(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, station_id } = req.params;

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
        return helper.sendResponse(res, { status: false, code: 400, error: 'Work Order is not In_Progress' });
      }

      const station = await SWorkOrderStation.findOne({
        where: { id: station_id, wo_id: id },
        transaction: t,
      });
      if (!station) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Station not found for this Work Order' });
      }
      if (station.status !== 'In_Progress') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Station is not In_Progress' });
      }

      const unresolvedCount = await SWorkOrderIssue.count({
        where: { wo_station_id: station_id, resolved_time: null, deleted_at: null },
        transaction: t,
      });
      if (unresolvedCount > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `Cannot complete station: ${unresolvedCount} unresolved issue(s) must be resolved first`,
        });
      }

      const { actual_quantity, under_production_reason } = validation.value;

      const maxAllowed = Math.ceil(wo.planned_quantity * 1.1);
      if (actual_quantity > maxAllowed) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `actual_quantity (${actual_quantity}) exceeds 110% of planned (${wo.planned_quantity})`,
        });
      }
      if (actual_quantity < wo.planned_quantity && !under_production_reason) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `under_production_reason is required when actual_quantity is below planned (${wo.planned_quantity})`,
        });
      }

      const now = new Date();
      await station.update({ status: 'Completed', actual_quantity, completed_at: now }, { transaction: t });

      // Record final progress delta for this station
      const prevCumulative = (await SWorkOrderProgress.sum('qty_good', {
        where:       { wo_station_id: station_id },
        transaction: t,
      })) || 0;

      const delta = actual_quantity - prevCumulative;
      if (delta > 0) {
        await SWorkOrderProgress.create(
          buildProgressPayload({
            woStationId:   station.id,
            qtyGood:       delta,
            qtyReject:     0,
            qtyScrap:      0,
            cumulativeQty: actual_quantity,
            plannedQty:    wo.planned_quantity,
            reportedBy:    req.user?.id ?? null,
            now,
          }),
          { transaction: t },
        );
      }

      // Auto-complete WO Line if all stations are now Completed
      const pendingStationCount = await SWorkOrderStation.count({
        where: { wo_id: id, status: { [Op.ne]: 'Completed' }, },
        transaction: t,
      });

      let woCompleted = false;
      if (pendingStationCount === 0) {
        const totalActual = (await SWorkOrderStation.sum('actual_quantity', {
          where: { wo_id: id },
          transaction: t,
        })) || actual_quantity;

        await wo.update({ status: 'Completed', actual_quantity: totalActual, actual_end_time: now }, { transaction: t });
        woCompleted = true;

        await this.logActivity(req, {
          moduleCode:  'work_order', activityCode: 'COMPLETE',
          resourceId:  wo.id, newData: wo,
          description: `Auto-completed WO ${wo.wo_number} — all stations done`,
          transaction: t,
        });

        // Sync schedule and PO
        await this._syncScheduleAndPO(wo, totalActual, now, t);
      }

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Station completed',
        data: {
          station_id:      station.id,
          wo_station_number: station.wo_station_number,
          status:          'Completed',
          actual_quantity,
          completed_at:    now,
          wo_completed:    woCompleted,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][completeStation]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── WO Station: Progress ──────────────────────────────────────────────────

  async addStationProgress(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, station_id } = req.params;

      const schema = Joi.object({
        qty_good:    Joi.number().integer().min(0).required(),
        qty_reject:  Joi.number().integer().min(0).default(0),
        qty_scrap:   Joi.number().integer().min(0).default(0),
        reported_by: Joi.number().integer().min(1).required(),
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

      const station = await SWorkOrderStation.findOne({ where: { id: station_id, wo_id: id }, transaction: t });
      if (!station) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Station not found for this Work Order' });
      }
      if (station.status !== 'In_Progress') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Progress can only be reported on In_Progress stations' });
      }

      const { qty_good, qty_reject, qty_scrap, reported_by } = validation.value;

      const prevCumulative = (await SWorkOrderProgress.sum('qty_good', {
        where: { wo_station_id: station_id },
        transaction: t,
      })) || 0;

      const cumulativeQty = prevCumulative + qty_good;
      if (cumulativeQty > wo.planned_quantity) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `Cumulative qty_good (${cumulativeQty}) exceeds planned_quantity (${wo.planned_quantity})`,
        });
      }

      const now      = new Date();
      const progress = await SWorkOrderProgress.create(
        buildProgressPayload({
          woStationId:   station.id,
          qtyGood:       qty_good,
          qtyReject:     qty_reject,
          qtyScrap:      qty_scrap,
          cumulativeQty,
          plannedQty:    wo.planned_quantity,
          reportedBy:    reported_by,
          now,
        }),
        { transaction: t },
      );

      await station.update({ actual_quantity: cumulativeQty }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 201, message: 'Progress recorded', data: progress });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][addStationProgress]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async getStationProgresses(req, res) {
    try {
      const { id, station_id } = req.params;

      const station = await SWorkOrderStation.findOne({ where: { id: station_id, wo_id: id } });
      if (!station) return helper.sendResponse(res, { status: false, code: 404, error: 'Station not found for this Work Order' });

      const progresses = await SWorkOrderProgress.findAll({
        where: { wo_station_id: station_id },
        order: [['reported_at', 'DESC']],
      });

      return helper.sendResponse(res, { status: true, code: 200, data: progresses });
    } catch (error) {
      console.log('[WorkOrderModule][getStationProgresses]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── WO Station: Issues ────────────────────────────────────────────────────

  async reportStationIssue(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, station_id } = req.params;

      const schema = Joi.object({
        issue_type:        Joi.string().valid(...ISSUE_TYPES).required(),
        issue_description: Joi.string().required(),
        reported_by:       Joi.number().integer().min(1).required(),
        severity:          Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional().allow(null),
        downtime_start:    Joi.date().iso().optional().allow(null),
        downtime_end:      Joi.date().iso().optional().allow(null),
        downtime_minutes:  Joi.number().integer().min(0).optional().allow(null),
        defect_qty:        Joi.number().integer().min(0).optional().allow(null),
        defect_type:       Joi.string().optional().allow('', null),
        pause_reason:      Joi.string().optional().allow('', null),
        paused_by:         Joi.number().integer().min(1).optional().allow(null),
        paused_at:         Joi.date().iso().optional().allow(null),
        shift_end_qty:     Joi.number().integer().min(0).optional().allow(null),
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

      const station = await SWorkOrderStation.findOne({ where: { id: station_id, wo_id: id }, transaction: t });
      if (!station) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Station not found for this Work Order' });
      }
      if (!['In_Progress', 'Released'].includes(station.status)) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Issues can only be reported on Released or In_Progress stations' });
      }

      const { downtime_start, downtime_end, reported_by, paused_at, ...issueData } = validation.value;

      let downtimeMinutes = issueData.downtime_minutes;
      if (downtime_start && downtime_end && !downtimeMinutes) {
        const ms = new Date(downtime_end) - new Date(downtime_start);
        downtimeMinutes = Math.max(0, Math.round(ms / 60000));
      }

      const issue = await SWorkOrderIssue.create({
        wo_station_id:    station.id,
        ...issueData,
        downtime_start:   downtime_start  ?? null,
        downtime_end:     downtime_end    ?? null,
        downtime_minutes: downtimeMinutes ?? null,
        paused_at:        paused_at       ?? null,
        reported_by,
        reported_time:    new Date(),
      }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 201, message: 'Issue reported', data: issue });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][reportStationIssue]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async getStationIssues(req, res) {
    try {
      const { id, station_id } = req.params;
      const { resolved } = req.query;

      const station = await SWorkOrderStation.findOne({ where: { id: station_id, wo_id: id } });
      if (!station) return helper.sendResponse(res, { status: false, code: 404, error: 'Station not found for this Work Order' });

      const where = { wo_station_id: station_id, deleted_at: null };
      if (resolved === 'true')  where.resolved_time = { [Op.ne]: null };
      if (resolved === 'false') where.resolved_time = null;

      const issues = await SWorkOrderIssue.findAll({ where, order: [['reported_time', 'DESC']] });

      return helper.sendResponse(res, { status: true, code: 200, data: issues });
    } catch (error) {
      console.log('[WorkOrderModule][getStationIssues]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async resolveStationIssue(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, station_id, issue_id } = req.params;

      const schema = Joi.object({
        resolution:             Joi.string().required(),
        resolved_by:            Joi.number().integer().min(1).required(),
        resumed_by:             Joi.number().integer().min(1).optional().allow(null),
        resumed_at:             Joi.date().iso().optional().allow(null),
        pause_duration_minutes: Joi.number().integer().min(0).optional().allow(null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const issue = await SWorkOrderIssue.findOne({
        where: { id: issue_id, wo_station_id: station_id, deleted_at: null },
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
      console.log('[WorkOrderModule][resolveStationIssue]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── WO Station: Materials ─────────────────────────────────────────────────

  async getStationMaterials(req, res) {
    try {
      const { id, station_id } = req.params;

      const station = await SWorkOrderStation.findOne({ where: { id: station_id, wo_id: id } });
      if (!station) return helper.sendResponse(res, { status: false, code: 404, error: 'Station not found for this Work Order' });

      const materials = await SWorkOrderMaterial.findAll({
        where:   { wo_station_id: station_id },
        include: [{
          model:      SParts,
          as:         'material_part',
          attributes: ['id', 'part_number', 'part_name'],
          required:   false,
        }],
        order: [['id', 'ASC']],
      });

      return helper.sendResponse(res, { status: true, code: 200, data: materials });
    } catch (error) {
      console.log('[WorkOrderModule][getStationMaterials]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async updateStationMaterialActual(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, station_id, material_id } = req.params;

      const schema = Joi.object({
        actual_quantity: Joi.number().min(0).required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const station = await SWorkOrderStation.findOne({ where: { id: station_id, wo_id: id }, transaction: t });
      if (!station) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Station not found for this Work Order' });
      }
      if (station.status !== 'In_Progress') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Material actual quantity can only be updated on In_Progress stations' });
      }

      const material = await SWorkOrderMaterial.findOne({
        where: { id: material_id, wo_station_id: station_id },
        transaction: t,
      });
      if (!material) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Material not found for this station' });
      }

      await material.update({ actual_quantity: validation.value.actual_quantity }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Material actual quantity updated', data: material });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][updateStationMaterialActual]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Keep: updateStationStatus (manual override, kept for flexibility) ──────

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

      const station = await SWorkOrderStation.findOne({ where: { id: station_id, wo_id: id }, transaction: t });
      if (!station) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Station not found for this Work Order' });
      }

      await station.update({ status: validation.value.status }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Station status updated', data: station });
    } catch (error) {
      await t.rollback();
      console.log('[WorkOrderModule][updateStationStatus]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Internal: Sync schedule and PO after WO Line completion ──────────────

  async _syncScheduleAndPO(wo, actualQty, now, t) {
    if (!wo.po_schedule_id) return;

    const accumulatedActualQty = await SWorkOrder.sum('actual_quantity', {
      where: { po_schedule_id: wo.po_schedule_id, deleted_at: null },
      transaction: t,
    });

    const pendingInSchedule = await SWorkOrder.count({
      where: { po_schedule_id: wo.po_schedule_id, status: { [Op.ne]: 'Completed' }, deleted_at: null },
      transaction: t,
    });

    await SProductionOrderSchedule.update(
      { actual_qty_per_day: accumulatedActualQty || 0, status: pendingInSchedule === 0 ? 'Completed' : 'In_Progress' },
      { where: { id: wo.po_schedule_id }, transaction: t },
    );

    const linkedSchedule = await SProductionOrderSchedule.findOne({
      where: { id: wo.po_schedule_id }, attributes: ['po_product_id'], transaction: t,
    });

    if (linkedSchedule?.po_product_id) {
      const allScheduleIds = (await SProductionOrderSchedule.findAll({
        where: { po_product_id: linkedSchedule.po_product_id }, attributes: ['id'], raw: true, transaction: t,
      })).map((s) => s.id);

      const productActualSum = allScheduleIds.length > 0
        ? await SWorkOrder.sum('actual_quantity', {
            where: { deleted_at: null, po_schedule_id: { [Op.in]: allScheduleIds } },
            transaction: t,
          })
        : 0;

      await SProductionOrderProduct.update(
        { actual_qty: productActualSum || 0 },
        { where: { id: linkedSchedule.po_product_id }, transaction: t },
      );
    }

    const pendingWoCount = await SWorkOrder.count({
      where: { po_id: wo.po_id, status: { [Op.notIn]: ['Completed'] }, deleted_at: null },
      transaction: t,
    });

    if (pendingWoCount === 0) {
      await SProductionOrder.update(
        { status: 'Completed', completed_at: now },
        { where: { id: wo.po_id }, transaction: t },
      );
    }
  }

  async liveMonitor(req, res) {
    try {
      const { work_date, line_id, shift_id } = req.query
  
      const targetDate = work_date ?? new Date().toISOString().split('T')[0]
  
      const where = {
        work_date:  targetDate,
        status:     { [Op.in]: ['Released', 'In_Progress', 'Completed'] },
        deleted_at: null,
      }
  
      if (line_id)  where.line_id  = line_id
      if (shift_id) where.shift_id = shift_id
  
      const workOrders = await SWorkOrder.findAll({
        where,
        attributes: [
          'id', 'wo_number', 'status', 'sequence',
          'planned_quantity', 'actual_quantity',
          'actual_start_time', 'actual_end_time', 'work_date',
          'part_name_snapshot', 'line_name_snapshot', 'shift_name_snapshot',
          'part_id', 'line_id', 'shift_id',
        ],
        include: [
          { model: SParts,  as: 'part',  attributes: ['id', 'part_number', 'part_name'] },
          { model: SLines,  as: 'line',  attributes: ['id', 'line_code', 'name'] },
          { model: SShifts, as: 'shift', attributes: ['id', 'name', 'start_time', 'end_time'] },
          {
            model:    SWorkOrderProgress,
            as:       'progresses',
            attributes: ['qty_good', 'qty_reject', 'qty_scrap', 'cumulative_qty_good', 'reported_at'],
            required: false,
            order:    [['reported_at', 'DESC']],
            limit:    1,
            separate: true,
          },
          {
            model:    SWorkOrderIssue,
            as:       'issues',
            where:    { resolved_time: null, deleted_at: null },
            attributes: ['id', 'issue_type', 'severity', 'reported_time', 'issue_description'],
            required: false,
          },
        ],
        order: [['line_id', 'ASC'], ['sequence', 'ASC'], ['wo_number', 'ASC']],
      })
  
      // Build per-WO metrics from aggregates
      const woIds = workOrders.map((w) => w.id)
  
      const [progressAgg, downtimeAgg] = await Promise.all([
        // Cumulative good/reject/scrap per WO
        SWorkOrderProgress.findAll({
          where:      { wo_id: { [Op.in]: woIds } },
          attributes: [
            'wo_id',
            [fn('SUM', col('qty_good')),   'total_good'],
            [fn('SUM', col('qty_reject')), 'total_reject'],
            [fn('SUM', col('qty_scrap')),  'total_scrap'],
          ],
          group: ['wo_id'],
          raw:   true,
        }),
        // Total downtime minutes per WO
        SWorkOrderIssue.findAll({
          where: {
            wo_id:      { [Op.in]: woIds },
            issue_type: 'DOWNTIME',
            deleted_at: null,
          },
          attributes: [
            'wo_id',
            [fn('SUM', col('downtime_minutes')), 'total_downtime'],
            [fn('COUNT', col('id')),             'downtime_count'],
          ],
          group: ['wo_id'],
          raw:   true,
        }),
      ])
  
      const progressMap  = Object.fromEntries(progressAgg.map((r)  => [r.wo_id, r]))
      const downtimeMap  = Object.fromEntries(downtimeAgg.map((r)  => [r.wo_id, r]))
  
      const rows = workOrders.map((wo) => {
        const prog     = progressMap[wo.id]
        const dt       = downtimeMap[wo.id]
        const planned  = wo.planned_quantity || 0
        const good     = parseInt(prog?.total_good   ?? 0, 10)
        const reject   = parseInt(prog?.total_reject ?? 0, 10)
        const scrap    = parseInt(prog?.total_scrap  ?? 0, 10)
        const pct      = planned > 0 ? Math.round((good / planned) * 10000) / 100 : 0
        const openIssues = (wo.issues ?? [])
  
        // OEE-lite: available time minus downtime
        const downtimeMins    = parseInt(dt?.total_downtime ?? 0, 10)
        const downtimeCount   = parseInt(dt?.downtime_count ?? 0, 10)
  
        // Deviation: how far behind/ahead vs planned
        const deviation = good - planned
        let health = 'on_track'
        if (wo.status === 'In_Progress') {
          if (pct < 50 && openIssues.length > 0) health = 'critical'
          else if (pct < 80)                      health = 'at_risk'
        }
        if (wo.status === 'Completed') health = 'completed'
        if (wo.status === 'Released')  health = 'not_started'
  
        return {
          id:               wo.id,
          wo_number:        wo.wo_number,
          status:           wo.status,
          stage:            wo.sequence,
          part:             wo.part  ?? { part_name: wo.part_name_snapshot,  part_number: null },
          line:             wo.line  ?? { name: wo.line_name_snapshot },
          shift:            wo.shift ?? { name: wo.shift_name_snapshot },
          planned_quantity: planned,
          actual_quantity:  wo.actual_quantity,
          qty_good:         good,
          qty_reject:       reject,
          qty_scrap:        scrap,
          progress_pct:     pct,
          deviation,
          health,
          actual_start_time: wo.actual_start_time,
          actual_end_time:   wo.actual_end_time,
          downtime_minutes:  downtimeMins,
          downtime_count:    downtimeCount,
          open_issues:       openIssues,
          open_issue_count:  openIssues.length,
        }
      })
  
      // Top-level summary
      const summary = {
        work_date:        targetDate,
        total_wo:         rows.length,
        not_started:      rows.filter((r) => r.health === 'not_started').length,
        on_track:         rows.filter((r) => r.health === 'on_track').length,
        at_risk:          rows.filter((r) => r.health === 'at_risk').length,
        critical:         rows.filter((r) => r.health === 'critical').length,
        completed:        rows.filter((r) => r.health === 'completed').length,
        total_planned:    rows.reduce((acc, r) => acc + r.planned_quantity, 0),
        total_good:       rows.reduce((acc, r) => acc + r.qty_good, 0),
        total_reject:     rows.reduce((acc, r) => acc + r.qty_reject, 0),
        total_scrap:      rows.reduce((acc, r) => acc + r.qty_scrap, 0),
        total_downtime:   rows.reduce((acc, r) => acc + r.downtime_minutes, 0),
        total_open_issues: rows.reduce((acc, r) => acc + r.open_issue_count, 0),
      }
  
      summary.overall_achievement_pct = summary.total_planned > 0
        ? Math.round((summary.total_good / summary.total_planned) * 10000) / 100
        : 0
  
      return helper.sendResponse(res, {
        status: true, code: 200,
        data: { summary, work_orders: rows },
      })
    } catch (error) {
      console.log('[WorkOrderModule][liveMonitor]:', error)
      return helper.sendResponse(res, { status: false, code: 500, error: error.message })
    }
  }
}

export default new WorkOrderModule();