import express from 'express';
import sdo from '../../module/sales/sdo.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

router.get('/dd-vehicles', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdo.getDropdownVehicles(req));
});

router.get('/dd-drivers', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdo.getDropdownDrivers(req));
});

router.get('/', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdo.list(req));
});

router.post('/', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdo.create(req));
});

router.get('/:id', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdo.detail(req));
});

// ── Status Update: In Transit → Delivered (with POD upload)
router.put('/:id/status', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdo.updateStatus(req));
});

// ── Print official DO PDF (Surat Jalan)
router.get('/:id/pdf', session.sessionChecker, async (req, res) => {
  return sdo.printSuratJalan(req, res);
});

export default router;
