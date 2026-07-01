import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import { QueryTypes } from 'sequelize';

class ProductionAnalyticsModule extends BaseModule {
  // Build reusable WHERE clauses for each table dimension used across analytics queries
  buildFilters(query = {}) {
    const {
      date_from,
      date_to,
      line_id,
      shift_id,
      status
    } = query;

    const replacements = {};
    const scheduleWhere = [];
    const woWhere = [];
    const poWhere = [];
    const rescheduleWhere = [];
    const capacityWhere = [];

    if (date_from) {
      scheduleWhere.push(`pos.production_date >= :date_from`);
      woWhere.push(`wo.work_date >= :date_from`);
      poWhere.push(`po.production_end_date >= :date_from`);
      rescheduleWhere.push(`log.rescheduled_at >= :date_from`);
      capacityWhere.push(`cr.calculated_at >= :date_from`);
      replacements.date_from = date_from;
    }

    if (date_to) {
      scheduleWhere.push(`pos.production_date <= :date_to`);
      woWhere.push(`wo.work_date <= :date_to`);
      poWhere.push(`po.production_end_date <= :date_to`);
      rescheduleWhere.push(`log.rescheduled_at <= :date_to_ts`);
      capacityWhere.push(`cr.calculated_at <= :date_to_ts`);
      replacements.date_to = date_to;
      replacements.date_to_ts = `${date_to} 23:59:59`;
    }

    if (line_id) {
      scheduleWhere.push(`pos.line_id = :line_id`);
      woWhere.push(`wo.line_id = :line_id`);
      capacityWhere.push(`cr.line_id = :line_id`);
      replacements.line_id = line_id;
    }

    if (shift_id) {
      scheduleWhere.push(`pos.shift_id = :shift_id`);
      woWhere.push(`wo.shift_id = :shift_id`);
      replacements.shift_id = shift_id;
    }

    if (status) {
      woWhere.push(`wo.status = :status`);
      replacements.status = status;
    }

    return {
      replacements,
      scheduleWhereClause: scheduleWhere.length ? `WHERE ${scheduleWhere.join(' AND ')}` : '',
      woWhereClause: woWhere.length ? `WHERE ${woWhere.join(' AND ')}` : '',
      poWhereClause: poWhere.length ? `WHERE ${poWhere.join(' AND ')}` : '',
      rescheduleWhereClause: rescheduleWhere.length ? `WHERE ${rescheduleWhere.join(' AND ')}` : '',
      capacityWhereClause: capacityWhere.length ? `WHERE ${capacityWhere.join(' AND ')}` : ''
    };
  }

  async executiveSummary(req, res) {
    try {
      const { replacements, woWhereClause, scheduleWhereClause } = this.buildFilters(req.query);

      // Work order level totals: planned vs actual quantity and achievement rate
      const woRows = await db.sequelize.query(`
        SELECT
          COUNT(DISTINCT wo.po_id)::int AS total_production_orders,
          COUNT(wo.id)::int AS total_work_orders,
          COALESCE(SUM(wo.planned_quantity), 0)::int AS total_planned_qty,
          COALESCE(SUM(wo.actual_quantity), 0)::int AS total_actual_qty,
          CASE
            WHEN COALESCE(SUM(wo.planned_quantity), 0) > 0
            THEN ROUND((COALESCE(SUM(wo.actual_quantity), 0)::decimal / SUM(wo.planned_quantity)::decimal) * 100, 2)
            ELSE 0
          END AS achievement_rate,
          COUNT(wo.id) FILTER (WHERE wo.status = 'Completed')::int AS completed_work_orders,
          COUNT(wo.id) FILTER (WHERE wo.status NOT IN ('Completed', 'Closed'))::int AS in_progress_work_orders
        FROM s_work_orders wo
        ${woWhereClause}
      `, { replacements, type: QueryTypes.SELECT });

      // Quality totals: good, reject, scrap output and defect rate
      const qualityRows = await db.sequelize.query(`
        SELECT
          COALESCE(SUM(p.qty_good), 0)::int AS total_good_qty,
          COALESCE(SUM(p.qty_reject), 0)::int AS total_reject_qty,
          COALESCE(SUM(p.qty_scrap), 0)::int AS total_scrap_qty,
          CASE
            WHEN COALESCE(SUM(p.qty_good + p.qty_reject + p.qty_scrap), 0) > 0
            THEN ROUND(
              (COALESCE(SUM(p.qty_reject + p.qty_scrap), 0)::decimal /
              SUM(p.qty_good + p.qty_reject + p.qty_scrap)::decimal) * 100, 2
            )
            ELSE 0
          END AS defect_rate
        FROM s_work_order_progresses p
        JOIN s_work_order_stations wos ON wos.id = p.wo_station_id
        JOIN s_work_orders wo ON wo.id = wos.wo_id
        ${woWhereClause}
      `, { replacements, type: QueryTypes.SELECT });

      // Downtime totals from reported work order issues
      const downtimeRows = await db.sequelize.query(`
        SELECT
          COALESCE(SUM(i.downtime_minutes), 0)::int AS total_downtime_minutes,
          COUNT(i.id)::int AS total_issues
        FROM s_work_order_issues i
        JOIN s_work_order_stations wos ON wos.id = i.wo_station_id
        JOIN s_work_orders wo ON wo.id = wos.wo_id
        ${woWhereClause}
      `, { replacements, type: QueryTypes.SELECT });

      // Average planned capacity utilization from production schedules
      const capacityRows = await db.sequelize.query(`
        SELECT COALESCE(ROUND(AVG(pos.utilization_pct), 2), 0) AS avg_capacity_utilization
        FROM s_production_order_schedules pos
        ${scheduleWhereClause}
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: {
          ...(woRows[0] || {}),
          ...(qualityRows[0] || {}),
          ...(downtimeRows[0] || {}),
          ...(capacityRows[0] || {})
        }
      });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][executiveSummary]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async productionTrend(req, res) {
    try {
      const { replacements, scheduleWhereClause } = this.buildFilters(req.query);

      // Daily planned vs actual quantity trend from production order schedules
      const rows = await db.sequelize.query(`
        SELECT
          pos.production_date,
          COALESCE(SUM(pos.planned_qty_per_day), 0)::int AS planned_qty,
          COALESCE(SUM(pos.actual_qty_per_day), 0)::int AS actual_qty
        FROM s_production_order_schedules pos
        ${scheduleWhereClause}
        GROUP BY pos.production_date
        ORDER BY pos.production_date ASC
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][productionTrend]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async lineUtilization(req, res) {
    try {
      const { replacements, scheduleWhereClause } = this.buildFilters(req.query);

      // Average capacity utilization and output volume grouped by production line
      const rows = await db.sequelize.query(`
        SELECT
          COALESCE(pos.line_name_snapshot, l.name) AS line_name,
          ROUND(AVG(pos.utilization_pct), 2) AS avg_utilization_pct,
          COALESCE(SUM(pos.planned_qty_per_day), 0)::int AS total_planned_qty,
          COALESCE(SUM(pos.actual_qty_per_day), 0)::int AS total_actual_qty
        FROM s_production_order_schedules pos
        LEFT JOIN s_lines l ON l.id = pos.line_id
        ${scheduleWhereClause}
        GROUP BY COALESCE(pos.line_name_snapshot, l.name)
        ORDER BY avg_utilization_pct DESC
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][lineUtilization]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async workOrderStatus(req, res) {
    try {
      const { replacements, woWhereClause } = this.buildFilters(req.query);

      // Distribution of work orders across status values
      const rows = await db.sequelize.query(`
        SELECT wo.status, COUNT(wo.id)::int AS total
        FROM s_work_orders wo
        ${woWhereClause}
        GROUP BY wo.status
        ORDER BY total DESC
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][workOrderStatus]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async outputQuality(req, res) {
    try {
      const { replacements, woWhereClause } = this.buildFilters(req.query);

      // Daily good, reject, and scrap quantity trend from work order progress reports
      const rows = await db.sequelize.query(`
        SELECT
          wo.work_date,
          COALESCE(SUM(p.qty_good), 0)::int AS qty_good,
          COALESCE(SUM(p.qty_reject), 0)::int AS qty_reject,
          COALESCE(SUM(p.qty_scrap), 0)::int AS qty_scrap
        FROM s_work_order_progresses p
        JOIN s_work_order_stations wos ON wos.id = p.wo_station_id
        JOIN s_work_orders wo ON wo.id = wos.wo_id
        ${woWhereClause}
        GROUP BY wo.work_date
        ORDER BY wo.work_date ASC
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][outputQuality]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async downtimeByType(req, res) {
    try {
      const { replacements, woWhereClause } = this.buildFilters(req.query);

      // Top 5 issue types ranked by accumulated downtime minutes
      const rows = await db.sequelize.query(`
        SELECT
          i.issue_type,
          COALESCE(SUM(i.downtime_minutes), 0)::int AS total_downtime_minutes,
          COUNT(i.id)::int AS total_occurrences
        FROM s_work_order_issues i
        JOIN s_work_order_stations wos ON wos.id = i.wo_station_id
        JOIN s_work_orders wo ON wo.id = wos.wo_id
        ${woWhereClause}
        GROUP BY i.issue_type
        ORDER BY total_downtime_minutes DESC
        LIMIT 5
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][downtimeByType]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async topDowntimeStations(req, res) {
    try {
      const { replacements, woWhereClause } = this.buildFilters(req.query);

      // Top 5 stations contributing the most downtime, useful for bottleneck identification
      const rows = await db.sequelize.query(`
        SELECT
          st.station_code,
          st.name AS station_name,
          COALESCE(SUM(i.downtime_minutes), 0)::int AS total_downtime_minutes,
          COUNT(i.id)::int AS total_issues
        FROM s_work_order_issues i
        JOIN s_work_order_stations wos ON wos.id = i.wo_station_id
        JOIN s_work_orders wo ON wo.id = wos.wo_id
        JOIN s_stations st ON st.id = wos.station_id
        ${woWhereClause}
        GROUP BY st.id, st.station_code, st.name
        ORDER BY total_downtime_minutes DESC
        LIMIT 5
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][topDowntimeStations]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async defectByType(req, res) {
    try {
      const { replacements, woWhereClause } = this.buildFilters(req.query);

      // Top 5 defect types ranked by total defective quantity, only counting rows with actual defects
      const rows = await db.sequelize.query(`
        SELECT
          COALESCE(i.defect_type, 'Unspecified') AS defect_type,
          COALESCE(SUM(i.defect_qty), 0)::int AS total_defect_qty,
          COUNT(i.id)::int AS total_occurrences
        FROM s_work_order_issues i
        JOIN s_work_order_stations wos ON wos.id = i.wo_station_id
        JOIN s_work_orders wo ON wo.id = wos.wo_id
        ${woWhereClause}
        GROUP BY COALESCE(i.defect_type, 'Unspecified')
        HAVING COALESCE(SUM(i.defect_qty), 0) > 0
        ORDER BY total_defect_qty DESC
        LIMIT 5
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][defectByType]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async lineEfficiencyRanking(req, res) {
    try {
      const { replacements, woWhereClause } = this.buildFilters(req.query);

      // Ranking of lines by realization efficiency, actual quantity divided by planned quantity
      const rows = await db.sequelize.query(`
        SELECT
          COALESCE(wo.line_name_snapshot, l.name) AS line_name,
          COALESCE(SUM(wo.planned_quantity), 0)::int AS total_planned_qty,
          COALESCE(SUM(wo.actual_quantity), 0)::int AS total_actual_qty,
          CASE
            WHEN COALESCE(SUM(wo.planned_quantity), 0) > 0
            THEN ROUND((COALESCE(SUM(wo.actual_quantity), 0)::decimal / SUM(wo.planned_quantity)::decimal) * 100, 2)
            ELSE 0
          END AS efficiency_pct
        FROM s_work_orders wo
        LEFT JOIN s_lines l ON l.id = wo.line_id
        ${woWhereClause}
        GROUP BY COALESCE(wo.line_name_snapshot, l.name)
        ORDER BY efficiency_pct DESC
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][lineEfficiencyRanking]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async onTimeDelivery(req, res) {
    try {
      const { replacements, poWhereClause } = this.buildFilters(req.query);

      // Completion timeliness of production orders against their planned production end date
      // Note: this measures internal production completion, not the final delivery date to customer
      const rows = await db.sequelize.query(`
        SELECT
          COUNT(po.id) FILTER (
            WHERE po.completed_at IS NOT NULL AND po.completed_at::date <= po.production_end_date
          )::int AS on_time,
          COUNT(po.id) FILTER (
            WHERE po.completed_at IS NOT NULL AND po.completed_at::date > po.production_end_date
          )::int AS late,
          COUNT(po.id) FILTER (WHERE po.completed_at IS NULL)::int AS not_completed
        FROM s_production_orders po
        ${poWhereClause}
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows[0] || {} });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][onTimeDelivery]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async rescheduleFrequency(req, res) {
    try {
      const { replacements, rescheduleWhereClause } = this.buildFilters(req.query);

      // Daily count of production order reschedules and the work orders impacted by them
      const rows = await db.sequelize.query(`
        SELECT
          DATE(log.rescheduled_at) AS reschedule_date,
          COUNT(log.id)::int AS total_reschedules,
          COALESCE(SUM(log.impacted_wo_count), 0)::int AS total_impacted_wo
        FROM s_production_order_reschedule_logs log
        ${rescheduleWhereClause}
        GROUP BY DATE(log.rescheduled_at)
        ORDER BY reschedule_date ASC
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][rescheduleFrequency]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async capacityFeasibility(req, res) {
    try {
      const { replacements, capacityWhereClause } = this.buildFilters(req.query);

      // Distribution of capacity calculation results, POSSIBLE versus IMPOSSIBLE lines
      const rows = await db.sequelize.query(`
        SELECT cr.status, COUNT(cr.id)::int AS total
        FROM s_production_plan_capacity_results cr
        ${capacityWhereClause}
        GROUP BY cr.status
        ORDER BY total DESC
      `, { replacements, type: QueryTypes.SELECT });

      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][capacityFeasibility]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }

  async issueDetails(req, res) {
    try {
      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 5);
      const offset = (page - 1) * limit;

      const { replacements, woWhereClause } = this.buildFilters(req.query);

      const queryReplacements = { ...replacements, limit, offset };

      // Paginated list of reported issues for detailed downtime and defect investigation
      const rows = await db.sequelize.query(`
        SELECT
          i.id,
          i.reported_time,
          wo.wo_number,
          st.station_code,
          st.name AS station_name,
          i.issue_type,
          i.downtime_minutes,
          i.defect_type,
          i.defect_qty,
          i.severity,
          usrd.full_name AS reported_by
        FROM s_work_order_issues i
        JOIN s_work_order_stations wos ON wos.id = i.wo_station_id
        JOIN s_work_orders wo ON wo.id = wos.wo_id
        JOIN s_stations st ON st.id = wos.station_id
        LEFT JOIN s_users usr ON usr.id = i.reported_by
        LEFT JOIN s_users_details usrd ON usrd.user_id = usr.id
        ${woWhereClause}
        ORDER BY i.reported_time DESC
        LIMIT :limit OFFSET :offset
      `, { replacements: queryReplacements, type: QueryTypes.SELECT });

      const totalResult = await db.sequelize.query(`
        SELECT COUNT(i.id)::int AS total
        FROM s_work_order_issues i
        JOIN s_work_order_stations wos ON wos.id = i.wo_station_id
        JOIN s_work_orders wo ON wo.id = wos.wo_id
        JOIN s_stations st ON st.id = wos.station_id
        LEFT JOIN s_users usr ON usr.id = i.reported_by
        ${woWhereClause}
      `, { replacements, type: QueryTypes.SELECT });

      const total = totalResult[0]?.total || 0;

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: rows,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.log('[ProductionAnalyticsModule][issueDetails]:', error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal server error'
      });
    }
  }
}

export default new ProductionAnalyticsModule();