import express from 'express';
import module from '../../module/sales/forecast.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

router.get('/', session.sessionChecker, async (req, res) => {
  const result = await module.list(req);
  return helper.sendResponse(res, result);
});

// DROPDOWN
router.get('/dropdown/customers', session.sessionChecker, async (req, res) => {
  const result = await module.getDropdownCustomers(req);
  return helper.sendResponse(res, result);
});

router.get('/dropdown/forecast-types', session.sessionChecker, async (req, res) => {
  const result = await module.getDropdownForecastTypes(req);
  return helper.sendResponse(res, result);
});

router.get('/dropdown/status', session.sessionChecker, async (req, res) => {
  const result = await module.getDropdownStatuses(req);
  return helper.sendResponse(res, result);
});

router.get('/dropdown/parts', session.sessionChecker, async (req, res) => {
  const result = await module.getDropdownParts(req);
  return helper.sendResponse(res, result);
});

// STAFF
router.get('/template-detail', session.sessionChecker, async (req, res) => {
  await module.downloadTemplate(req, res);
});

router.post('/upload-detail', session.sessionChecker, async (req, res) => {
  const result = await module.uploadTemplate(req);
  return helper.sendResponse(res, result);
});

router.get('/:forecast_id/historical-qty', session.sessionChecker, async (req, res) => {
  const result = await module.getHistoricalQty(req);
  return helper.sendResponse(res, result);
});

router.get('/:id', session.sessionChecker, async (req, res) => {
  const result = await module.detail(req);
  return helper.sendResponse(res, result);
});

router.post('/', session.sessionChecker, async (req, res) => {
  const result = await module.createDraft(req);
  return helper.sendResponse(res, result);
});

router.put('/:id', session.sessionChecker, async (req, res) => {
  const result = await module.update(req);
  return helper.sendResponse(res, result);
});

router.put('/:id/detail', session.sessionChecker, async (req, res) => {
  const result = await module.updateDetails(req);
  return helper.sendResponse(res, result);
});

router.delete('/:id', session.sessionChecker, async (req, res) => {
  const result = await module.deleteDraft(req);
  return helper.sendResponse(res, result);
});

// SUPERVISOR
router.put('/:id/approve', session.sessionChecker, async (req, res) => {
  const result = await module.approve(req);
  return helper.sendResponse(res, result);
});



export default router;
