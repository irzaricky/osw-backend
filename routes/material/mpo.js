import express from 'express';
import mpo from '../../module/material/mpo.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

const ALL      = ['Superadmin', 'Admin Material', 'Staff Material', 'Supervisor Material'];
const MAKER    = ['Superadmin', 'Admin Material', 'Staff Material'];
const APPROVER = ['Superadmin', 'Admin Material', 'Supervisor Material'];


// AUTO-GENERATE MPO
router.post('/auto-generate', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await mpo.autoGenerate(req));
});


// DROPDOWN

router.get('/dd-status',   session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mpo.getDropdownStatuses(req));
});

router.get('/dd-source',   session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mpo.getDropdownSource(req));
});

router.get('/dd-supplier', session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mpo.getDropdownSupplier(req));
});

// Load source data (MPR or MRP) to pre-fill PO form — must be before /:id routes
router.get('/source-data/:source_type/:source_id', session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mpo.getSourceData(req));
});

// BULK ACTIONS — HARUS didefinisikan SEBELUM route dinamis (/:id, /:id/status)
// agar Express tidak salah mencocokkan 'bulk-submit'/'bulk-review' sebagai :id.
// (Ini adalah penyebab bug serupa di modul MRP — jangan diulang di sini.)

// Bulk Submit: Draft -> Submitted (Maker)
router.put('/bulk-submit', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await mpo.bulkSubmit(req));
});

// Bulk Review: Submitted -> Approved/Rejected (Supervisor)
router.put('/bulk-review', session.sessionChecker, session.permissionChecker(APPROVER), async (req, res) => {
  return helper.sendResponse(res, await mpo.bulkReview(req));
});

// CRUD

router.get('/',    session.sessionChecker, session.permissionChecker(ALL),   async (req, res) => {
  return helper.sendResponse(res, await mpo.list(req));
});

router.post('/',   session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await mpo.create(req));
});

router.get('/:id', session.sessionChecker, session.permissionChecker(ALL),   async (req, res) => {
  return helper.sendResponse(res, await mpo.detail(req));
});

router.put('/:id', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await mpo.update(req));
});

router.delete('/:id', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await mpo.delete(req));
});

router.put('/:id/split-update', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await mpo.splitUpdate(req));
});

// Approve / Reject single (Supervisor)
router.put('/:id/status', session.sessionChecker, session.permissionChecker(APPROVER), async (req, res) => {
  return helper.sendResponse(res, await mpo.updateStatus(req));
});

// MDO history for a given MPO
router.get('/:id/mdo-history', session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mpo.getMdoHistory(req));
});

export default router;