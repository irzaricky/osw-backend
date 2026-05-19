import express from 'express';
import auth from '../../class/auth.class.js';
import OrderScheduleModule from '../../module/production-plan/order-schedule.js';

const router = express.Router();

/** GET /production-order/dropdown
 *  Active POs for select inputs (excludes Cancelled & Closed) */
router.get('/dropdown', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.getDropdown(req, res);
});

/** GET /production-order
 *  Paginated PO list — filters: search, status, priority, plan_id, date_from, date_to */
router.get('/', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.list(req, res);
});

/** POST /production-order
 *  Create new PO from an Approved Production Plan (header + product lines) */
router.post('/', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.create(req, res);
});

/** GET /production-order/:id
 *  Full PO detail: products → schedules + reschedule logs */
router.get('/:id', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.detail(req, res);
});

/** PUT /production-order/:id
 *  Update PO header fields (Draft only) */
router.put('/:id', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.update(req, res);
});

/** DELETE /production-order/:id
 *  Soft-delete PO (Draft only) */
router.delete('/:id', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.delete(req, res);
});

/** POST /production-order/:id/products
 *  Add a product line to the PO (Draft only) */
router.post('/:id/products', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.addProduct(req, res);
});

/** PUT /production-order/:id/products/:product_id
 *  Update a product line — line_id, delivery_date, planned_qty, notes (Draft only) */
router.put('/:id/products/:product_id', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.updateProduct(req, res);
});

/** DELETE /production-order/:id/products/:product_id
 *  Delete a product line and cascade its schedules (Draft only, no active WOs) */
router.delete('/:id/products/:product_id', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.deleteProduct(req, res);
});

/** POST /production-order/:id/products/:product_id/schedules
 *  Add a daily schedule entry to a product line (Draft or Released) */
router.post('/:id/products/:product_id/schedules', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.addSchedule(req, res);
});

/** PUT /production-order/:id/products/:product_id/schedules/:schedule_id
 *  Update a schedule entry (not Completed) */
router.put('/:id/products/:product_id/schedules/:schedule_id', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.updateSchedule(req, res);
});

/** DELETE /production-order/:id/products/:product_id/schedules/:schedule_id
 *  Delete a schedule entry (not In_Progress/Completed, no active WOs) */
router.delete('/:id/products/:product_id/schedules/:schedule_id', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.deleteSchedule(req, res);
});

/** POST /production-order/:id/release
 *  Release PO for production (Draft/Rejected → Released)
 *  Requires: all products must have at least one schedule */
router.post('/:id/release', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.release(req, res);
});

/** POST /production-order/:id/reject
 *  Reject a Released PO with reason (Released → Rejected) */
router.post('/:id/reject', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.reject(req, res);
});

/** POST /production-order/:id/cancel
 *  Cancel PO with reason (Draft/Released/In_Progress → Cancelled)
 *  Automatically cancels all non-completed Work Orders */
router.post('/:id/cancel', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.cancel(req, res);
});

/** POST /production-order/:id/complete
 *  Mark PO as completed (In_Progress → Completed)
 *  Requires: no pending/in-progress Work Orders remain */
router.post('/:id/complete', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.complete(req, res);
});

/** POST /production-order/:id/close
 *  Close a completed PO (Completed → Closed) */
router.post('/:id/close', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.close(req, res);
});

/** POST /production-order/:id/reschedule
 *  Shift PO date range and log the reschedule event (Draft or Released) */
router.post('/:id/reschedule', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.reschedule(req, res);
});

/** GET /production-order/:id/reschedule-logs
 *  Retrieve full reschedule history for a PO */
router.get('/:id/reschedule-logs', auth.sessionChecker, async (req, res) => {
  await OrderScheduleModule.getRescheduleLogs(req, res);
});

export default router;