import express from 'express';
import sdp from '../../module/sales/sdp.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

router.get('/dd-warehouses', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdp.getDropdownWarehouses(req));
});

router.get('/dd-docks', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdp.getDropdownDocks(req));
});

router.get('/available-spo-items', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdp.getAvailableSpoItems(req));
});

router.get('/', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdp.list(req));
});

router.post('/', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdp.create(req));
});

router.get('/:id', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdp.detail(req));
});

router.put('/:id', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdp.update(req));
});

router.delete('/:id', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await sdp.delete(req));
});

export default router;
