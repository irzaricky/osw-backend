import express from 'express';
import module from '../../module/sales/spr.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

router.get('/', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Forecast', 'Staff Sales Order', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  const result = await module.list(req);
  return helper.sendResponse(res, result);
});

// DROPDOWN
router.get('/dd-part', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Forecast', 'Staff Sales Order', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  const result = await module.getDropdownParts(req);
  return helper.sendResponse(res, result);
});

router.get('/dd-status', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Forecast', 'Staff Sales Order', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  const result = await module.getDropdownStatuses(req);
  return helper.sendResponse(res, result);
});

router.get('/dd-source', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Forecast', 'Staff Sales Order', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  const result = await module.getDropdownSources(req);
  return helper.sendResponse(res, result);
});



router.get('/template', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Forecast', 'Staff Sales Order', 'Admin sales']), async (req, res) => {
  await module.downloadTemplate(req, res);
});

router.post('/upload', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Forecast', 'Staff Sales Order', 'Admin sales']), async (req, res) => {
  const result = await module.uploadExcel(req);
  return helper.sendResponse(res, result);
});



router.get('/:id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Forecast', 'Staff Sales Order', 'Supervisor Sales', 'Admin sales']), async (req, res) => {
  const result = await module.detail(req);
  return helper.sendResponse(res, result);
});

router.get('/:id/export', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Forecast', 'Staff Sales Order', 'Admin sales']), async (req, res) => {
  await module.exportExcel(req, res);
});

router.get('/log/:log_id/export', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Forecast', 'Staff Sales Order', 'Admin sales']), async (req, res) => {
  await module.exportLogExcel(req, res);
});

// STAFF / ADMIN
router.post('/', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Admin sales']), async (req, res) => {
  const result = await module.createManual(req);
  return helper.sendResponse(res, result);
});

router.put('/:id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Admin sales']), async (req, res) => {
  const result = await module.update(req);
  return helper.sendResponse(res, result);
});

router.put('/:id/submit', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Admin sales']), async (req, res) => {
  const result = await module.submit(req);
  return helper.sendResponse(res, result);
});

router.delete('/:id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Staff Sales Order', 'Admin sales']), async (req, res) => {
  const result = await module.delete(req);
  return helper.sendResponse(res, result);
});

// SUPERVISOR SALES
router.put('/:id/review-sales', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  const result = await module.reviewSalesOrder(req);
  return helper.sendResponse(res, result);
});



export default router;