import express from 'express';
import module from '../../module/material/mrp.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

// PENTING: Route spesifik (/dropdown/..., /bulk-review, /sales-plan/:spr_id/load)
// HARUS sebelum /:id agar tidak tertangkap sebagai parameter id.

const ALL      = ['Superadmin', 'Admin Material', 'Staff Material', 'Supervisor Material'];
const MAKER    = ['Superadmin', 'Admin Material', 'Staff Material'];
const APPROVER = ['Superadmin', 'Admin Material', 'Supervisor Material'];

// ─────────────────────────────────────────────────────────────────────────────
// DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────

router.get('/dropdown/sales-plans', session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await module.getDropdownSalesPlans(req));
});

router.get('/dropdown/parts',       session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await module.getDropdownParts(req));
});

router.get('/dropdown/status',      session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await module.getDropdownStatuses(req));
});

router.get('/dropdown/priority',    session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await module.getDropdownPriority(req));
});

// Load Sales Plan data to pre-fill MRP form — must be before /:id routes
router.get('/sales-plan/:spr_id/load', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await module.loadSalesPlanData(req));
});

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get('/dashboard/critical-parts',    session.sessionChecker, session.permissionChecker(ALL),   async (req, res) => {
  return helper.sendResponse(res, await module.getDashboardCriticalParts(req));
});

router.get('/',    session.sessionChecker, session.permissionChecker(ALL),   async (req, res) => {
  return helper.sendResponse(res, await module.list(req));
});

router.post('/',   session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await module.createDraft(req));
});

// ─────────────────────────────────────────────────────────────────────────────
// BULK ACTIONS — must be before /:id to avoid route collision
// ─────────────────────────────────────────────────────────────────────────────

// Bulk submit (Draft → Submitted)
router.put('/bulk-submit', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await module.bulkSubmit(req));
});

// Bulk approve / reject
router.put('/bulk-review', session.sessionChecker, session.permissionChecker(APPROVER), async (req, res) => {
  return helper.sendResponse(res, await module.bulkReview(req));
});

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE RESOURCE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

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

// Update detail items only
router.put('/:id/detail', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await module.updateDetails(req));
});

// Approve / Reject single
router.put('/:id/review',  session.sessionChecker, session.permissionChecker(APPROVER), async (req, res) => {
  return helper.sendResponse(res, await module.review(req));
});

export default router;