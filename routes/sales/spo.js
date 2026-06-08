import express from 'express';
import spo from '../../module/sales/spo.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

// DROPDOWN
router.get('/dd-status', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Supervisor Sales', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  const result = await spo.getDropdownStatuses(req);
  return helper.sendResponse(res, result);
});

router.get('/dd-customer', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Supervisor Sales', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  const result = await spo.getDropdownCustomers(req);
  return helper.sendResponse(res, result);
});

router.get('/list-spr', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Supervisor Sales', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  const result = await spo.listSPR(req);
  return helper.sendResponse(res, result);
});

router.get('/', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Supervisor Sales', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  const result = await spo.list(req);
  return helper.sendResponse(res, result);
});

router.post('/', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Admin sales']), async (req, res) => {
  const result = await spo.createSpo(req);
  return helper.sendResponse(res, result);
});

router.get('/:id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Supervisor Sales', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  const result = await spo.detail(req);
  return helper.sendResponse(res, result);
});

router.put('/:id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  const result = await spo.update(req);
  return helper.sendResponse(res, result);
});

router.delete('/:id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Admin sales']), async (req, res) => {
  const result = await spo.delete(req);
  return helper.sendResponse(res, result);
});


router.put('/:id/status', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  const result = await spo.updateStatus(req);
  return helper.sendResponse(res, result);
});

router.get('/:id/sdo-history', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Supervisor Sales', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  const result = await spo.getSdoHistory(req);
  return helper.sendResponse(res, result);
});

router.get('/:id/pdf', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Supervisor Sales', 'Staff Sales Delivery', 'Admin sales']), async (req, res) => {
  await spo.generatePdf(req, res);
});

export default router;
