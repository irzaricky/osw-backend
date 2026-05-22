import express from 'express';
import mpo from '../../module/material/mpo.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

// DROPDOWN
router.get('/dd-status', session.sessionChecker, async (req, res) => {
  const result = await mpo.getDropdownStatuses(req);
  return helper.sendResponse(res, result);
});

router.get('/dd-source', session.sessionChecker, async (req, res) => {
  const result = await mpo.getDropdownSource(req);
  return helper.sendResponse(res, result);
});

router.get('/dd-supplier', session.sessionChecker, async (req, res) => {
  const result = await mpo.getDropdownSupplier(req);
  return helper.sendResponse(res, result);
});

// Load source data (MPR or MRP) to pre-fill PO form — must be before /:id routes
router.get('/source-data/:source_type/:source_id', session.sessionChecker, async (req, res) => {
  const result = await mpo.getSourceData(req);
  return helper.sendResponse(res, result);
});

// LIST
router.get('/', session.sessionChecker, async (req, res) => {
  const result = await mpo.list(req);
  return helper.sendResponse(res, result);
});

// CREATE
router.post('/', session.sessionChecker, async (req, res) => {
  const result = await mpo.create(req);
  return helper.sendResponse(res, result);
});

// DETAIL
router.get('/:id', session.sessionChecker, async (req, res) => {
  const result = await mpo.detail(req);
  return helper.sendResponse(res, result);
});

// UPDATE (header only, draft/rejected)
router.put('/:id', session.sessionChecker, async (req, res) => {
  const result = await mpo.update(req);
  return helper.sendResponse(res, result);
});

// DELETE (draft only)
router.delete('/:id', session.sessionChecker, async (req, res) => {
  const result = await mpo.delete(req);
  return helper.sendResponse(res, result);
});

// APPROVE / REJECT (Supervisor)
router.put('/:id/status', session.sessionChecker, async (req, res) => {
  const result = await mpo.updateStatus(req);
  return helper.sendResponse(res, result);
});

// MDO HISTORY
router.get('/:id/mdo-history', session.sessionChecker, async (req, res) => {
  const result = await mpo.getMdoHistory(req);
  return helper.sendResponse(res, result);
});

export default router;