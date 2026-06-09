import express from 'express';
import mdo from '../../module/material/mdo.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

const ALL    = ['Superadmin', 'Admin Material', 'Staff Material', 'Supervisor Material'];
const MAKER  = ['Superadmin', 'Admin Material', 'Staff Material'];
const APPROVER = ['Superadmin', 'Admin Material', 'Supervisor Material'];

// ─────────────────────────────────────────────────────────────────────────────
// DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────

router.get('/dd-status',     session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mdo.getDropdownStatuses(req));
});

router.get('/dd-warehouses', session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mdo.getDropdownWarehouses(req));
});

router.get('/dd-mpo',        session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mdo.getDropdownMpo(req));
});

router.get('/dd-docks',      session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mdo.getDropdownDocks(req));
});

router.get('/dd-vehicles',   session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mdo.getDropdownVehicles(req));
});

router.get('/preview-split', session.sessionChecker, session.permissionChecker(ALL), async (req, res) => {
  return helper.sendResponse(res, await mdo.previewSplit(req));
});

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get('/',        session.sessionChecker, session.permissionChecker(ALL),    async (req, res) => {
  return helper.sendResponse(res, await mdo.list(req));
});

router.post('/',       session.sessionChecker, session.permissionChecker(MAKER),  async (req, res) => {
  return helper.sendResponse(res, await mdo.create(req));
});

router.get('/:id',     session.sessionChecker, session.permissionChecker(ALL),    async (req, res) => {
  return helper.sendResponse(res, await mdo.detail(req));
});

router.put('/:id',     session.sessionChecker, session.permissionChecker(MAKER),  async (req, res) => {
  return helper.sendResponse(res, await mdo.update(req));
});

router.delete('/:id',  session.sessionChecker, session.permissionChecker(MAKER),  async (req, res) => {
  return helper.sendResponse(res, await mdo.delete(req));
});

// Advance status: scheduled → in_transit → arrived
router.put('/:id/status', session.sessionChecker, session.permissionChecker(MAKER), async (req, res) => {
  return helper.sendResponse(res, await mdo.updateStatus(req));
});

export default router;