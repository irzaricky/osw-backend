import express from 'express';
import sdp from '../../module/sales/sdp.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

router.get('/dd-warehouses', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdp.getDropdownWarehouses(req));
});

router.get('/dd-docks', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdp.getDropdownDocks(req));
});

router.get('/available-spo-items', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdp.getAvailableSpoItems(req));
});

router.get('/', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdp.list(req));
});

router.post('/', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdp.create(req));
});

router.get('/max-vehicle-capacity', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdp.getMaxVehicleCapacity(req));
});

router.get('/:id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdp.detail(req));
});

router.put('/:id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdp.update(req));
});

router.delete('/:id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  return helper.sendResponse(res, await sdp.delete(req));
});

export default router;
