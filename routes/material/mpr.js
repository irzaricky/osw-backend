import express from 'express';
import module from '../../module/material/mpr.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

// PENTING: Route spesifik (/dropdown/..., /bulk-review) HARUS sebelum /:id

const ALL      = ['Superadmin', 'Admin Material', 'Staff Material', 'Supervisor Material'];
const MAKER    = ['Superadmin', 'Admin Material', 'Staff Material'];
const APPROVER = ['Superadmin', 'Admin Material', 'Supervisor Material'];

// ─────────────────────────────────────────────────────────────────────────────
// DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────

router.get('/dropdown/status', session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await module.getDropdownStatuses(req));
});

router.get('/dropdown/parts',  session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await module.getDropdownParts(req));
});

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get('/',    session.sessionChecker, session.permissionChecker(ALL),   async (req, res) => {
  return helper.sendResponse(res, await module.list(req));
});

router.post('/',   session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await module.createEmergency(req));
});

router.get('/:id', session.sessionChecker, session.permissionChecker(ALL),   async (req, res) => {
  return helper.sendResponse(res, await module.detail(req));
});

router.put('/:id', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await module.update(req));
});

router.delete('/:id', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await module.deleteDraft(req));
});

// Submit draft → submitted
router.put('/:id/submit', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await module.submit(req));
});

// Approve / Reject bulk — HARUS sebelum /:id/review
router.put('/bulk-review',  session.sessionChecker, session.permissionChecker(APPROVER), async (req, res) => {
  return helper.sendResponse(res, await module.bulkReview(req));
});

// Approve / Reject single
router.put('/:id/review',   session.sessionChecker, session.permissionChecker(APPROVER), async (req, res) => {
  return helper.sendResponse(res, await module.review(req));
});

export default router;