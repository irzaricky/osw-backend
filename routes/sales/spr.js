import express from 'express';
import module from '../../module/sales/spr.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

router.get('/', session.sessionChecker, async (req, res) => {
  const result = await module.list(req);
  return helper.sendResponse(res, result);
});

// DROPDOWN
router.get('/dd-part', session.sessionChecker, async (req, res) => {
  const result = await module.getDropdownParts(req);
  return helper.sendResponse(res, result);
});

router.get('/dd-status', session.sessionChecker, async (req, res) => {
  const result = await module.getDropdownStatuses(req);
  return helper.sendResponse(res, result);
});

router.get('/dd-source', session.sessionChecker, async (req, res) => {
  const result = await module.getDropdownSources(req);
  return helper.sendResponse(res, result);
});



router.get('/template', session.sessionChecker, async (req, res) => {
  await module.downloadTemplate(req, res);
});

router.post('/upload', session.sessionChecker, async (req, res) => {
  const result = await module.uploadExcel(req);
  return helper.sendResponse(res, result);
});

// PPIC AGGREGATION (must be before /:id)
router.get('/ppic-aggregation', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor PPIC']), async (req, res) => {
  const result = await module.ppicAggregation(req);
  return helper.sendResponse(res, result);
});

router.put('/ppic-batch-approve', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor PPIC']), async (req, res) => {
  const result = await module.ppicBatchApprove(req);
  return helper.sendResponse(res, result);
});

router.get('/:id', session.sessionChecker, async (req, res) => {
  const result = await module.detail(req);
  return helper.sendResponse(res, result);
});

router.get('/:id/export', session.sessionChecker, async (req, res) => {
  await module.exportExcel(req, res);
});

router.get('/log/:log_id/export', session.sessionChecker, async (req, res) => {
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

// SUPERVISOR SALES ORDER
router.put('/:id/review-sales', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales Order']), async (req, res) => {
  const result = await module.reviewSalesOrder(req);
  return helper.sendResponse(res, result);
});

// SUPERVISOR PPIC
router.put('/:id/review-ppic', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor PPIC']), async (req, res) => {
  const result = await module.reviewPPIC(req);
  return helper.sendResponse(res, result);
});

export default router;