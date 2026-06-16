import express from 'express';
import sdo from '../../module/sales/sdo.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

router.get('/dd-vehicles', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Driver', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdo.getDropdownVehicles(req));
});

router.get('/dd-drivers', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Driver', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdo.getDropdownDrivers(req));
});

router.get('/', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Driver', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdo.list(req));
});

router.post('/', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdo.create(req));
});

router.get('/:id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Driver', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdo.detail(req));
});

// ── Status Update: In Transit → Delivered (with POD upload)
router.put('/:id/status', session.sessionChecker, session.permissionChecker(['Superadmin', 'Driver', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdo.updateStatus(req));
});

// ── Status Update: Created → Loading (with loading photo upload)
router.put('/:id/loading-photo', session.sessionChecker, session.permissionChecker(['Superadmin', 'Driver', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdo.uploadLoadingPhoto(req));
});

// ── Status Update: Approve Dispatch (Supervisor Sales only)
router.put('/:id/approve-dispatch', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await sdo.approveDispatch(req));
});

// ── Status Update: Start Delivery: Loading → In Transit
router.put('/:id/start-delivery', session.sessionChecker, session.permissionChecker(['Superadmin', 'Driver', 'Staff Sales Delivery', 'Admin sales', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await sdo.startDelivery(req));
});

// ── Print official DO PDF (Surat Jalan)
router.get('/:id/pdf', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Driver', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return sdo.printSuratJalan(req, res);
});

export default router;
