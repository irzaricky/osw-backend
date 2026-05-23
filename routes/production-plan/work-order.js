import express from 'express';
import auth from '../../class/auth.class.js';
import workOrderModule from '../../module/production-plan/work-order.js';

const router = express.Router();

// List, Summary & Detail

/** GET /work-orders
 *  Paginated list — filters: search, status, work_date, line_id, po_id */
router.get('/', auth.sessionChecker, async (req, res) => {
  await workOrderModule.list(req, res);
});

/** GET /work-orders/daily-summary
 *  Aggregated analytics for a given date (defaults to today).
 *  Query: ?work_date=YYYY-MM-DD */
router.get('/daily-summary', auth.sessionChecker, async (req, res) => {
  await workOrderModule.dailySummary(req, res);
});

/** GET /work-orders/:id
 *  Full detail: header + stations + station jobs + progresses + issues */
router.get('/:id', auth.sessionChecker, async (req, res) => {
  await workOrderModule.detail(req, res);
});

// Execution

/** POST /work-orders/:id/start
 *  Foreman starts the WO (Released → In_Progress).
 *  Also sets all WO Stations to In_Progress. */
router.post('/:id/start', auth.sessionChecker, async (req, res) => {
  await workOrderModule.start(req, res);
});

/** POST /work-orders/:id/complete
 *  Foreman completes the WO (In_Progress → Completed).
 *  Body: { actual_quantity, under_production_reason? }
 *  - under_production_reason is REQUIRED when actual_quantity < planned_quantity.
 *  - actual_quantity must not exceed 110% of planned_quantity.
 *  If all WOs under the same PO are Completed, the PO is auto-completed. */
router.post('/:id/complete', auth.sessionChecker, async (req, res) => {
  await workOrderModule.complete(req, res);
});

// Progress Reporting

/** GET /work-orders/:id/progresses
 *  List all progress entries for a WO, newest first. */
router.get('/:id/progresses', auth.sessionChecker, async (req, res) => {
  await workOrderModule.getProgresses(req, res);
});

/** POST /work-orders/:id/progresses
 *  Foreman submits a cumulative progress update.
 *  Body: { cumulative_qty, reported_by } */
router.post('/:id/progresses', auth.sessionChecker, async (req, res) => {
  await workOrderModule.addProgress(req, res);
});

// Issue / Kendala Reporting

/** GET /work-orders/:id/issues
 *  List issues for a WO.
 *  Query: ?resolved=true|false (omit for all) */
router.get('/:id/issues', auth.sessionChecker, async (req, res) => {
  await workOrderModule.getIssues(req, res);
});

/** POST /work-orders/:id/issues
 *  Foreman reports a new issue/kendala.
 *  Body: { issue_type, issue_description, reported_by,
 *          downtime_start?, downtime_end?, downtime_minutes?,
 *          defect_qty?, defect_type? }
 *  issue_type: DOWNTIME | DEFECT | MATERIAL | OTHER */
router.post('/:id/issues', auth.sessionChecker, async (req, res) => {
  await workOrderModule.reportIssue(req, res);
});

/** PUT /work-orders/:id/issues/:issue_id/resolve
 *  Mark an issue as resolved.
 *  Body: { resolution, resolved_by } */
router.put('/:id/issues/:issue_id/resolve', auth.sessionChecker, async (req, res) => {
  await workOrderModule.resolveIssue(req, res);
});

// Station Job Status

/** PUT /work-orders/:id/stations/:station_id/jobs/:job_id/status
 *  Update status (and optionally actual_time) of a single station job.
 *  Body: { status: 'Pending'|'In_Progress'|'Completed', actual_time? } */
router.put('/:id/stations/:station_id/jobs/:job_id/status', auth.sessionChecker, async (req, res) => {
  await workOrderModule.updateStationJobStatus(req, res);
});

export default router;