import express from 'express';
import auth from '../../class/auth.class.js';
import productionOrderModule from '../../module/production-plan/order-schedule.js';

const router = express.Router();

// List & Detail

/** GET /production-orders
 *  Paginated list — filters: search, status, plan_id */
router.get('/', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.list(req, res);
});

/** GET /production-orders/:id
 *  Full detail: header + products + schedules + reschedule logs */
router.get('/:id', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.detail(req, res);
});

// CRUD

/** POST /production-orders
 *  Create PO from an Approved Production Plan.
 *  Body: { plan_id, production_start_date, production_end_date, po_description?, priority? } */
router.post('/', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.create(req, res);
});

/** PUT /production-orders/:id
 *  Update header fields (Draft only).
 *  Body: { production_start_date?, production_end_date?, po_description?, priority? } */
router.put('/:id', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.update(req, res);
});

/** DELETE /production-orders/:id
 *  Soft-delete (Draft only) */
router.delete('/:id', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.delete(req, res);
});

// Scheduling

/** POST /production-orders/:id/generate-schedule
 *  Run scheduling engine — distributes planned qty across working days.
 *  Clears previous Draft schedules before regenerating. */
router.post('/:id/generate-schedule', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.generateSchedule(req, res);
});

/** PUT /production-orders/:id/schedules/:schedule_id
 *  Manual edit of a single schedule row (Draft PO only).
 *  Body: { production_date?, shift_id?, planned_qty_per_day?, notes? } */
router.put('/:id/schedules/:schedule_id', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.updateSchedule(req, res);
});

// Approval Workflow

/** POST /production-orders/:id/submit
 *  Submit for approval (Draft → Pending_Approval).
 *  Validates: schedule exists, total scheduled qty = planned qty, end_date < latest_delivery_date. */
router.post('/:id/submit', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.submit(req, res);
});

/** POST /production-orders/:id/approve
 *  Approve PO (Pending_Approval → Approved).
 *  Body: { notes? } */
router.post('/:id/approve', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.approve(req, res);
});

/** POST /production-orders/:id/reject
 *  Reject PO — returns to Draft.
 *  Body: { notes } (required) */
router.post('/:id/reject', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.reject(req, res);
});

// Release & Work Order Generation

/** POST /production-orders/:id/release
 *  Release PO (Approved → Released) and auto-generate Work Orders
 *  for every schedule row, including WO Stations and Station Jobs. */
router.post('/:id/release', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.release(req, res);
});

// Reschedule

/** POST /production-orders/:id/reschedule
 *  Log a reschedule request on a Released PO.
 *  Body: { new_start_date, new_end_date, reschedule_reason } (all required) */
router.post('/:id/reschedule', auth.sessionChecker, async (req, res) => {
  await productionOrderModule.reschedule(req, res);
});

export default router;