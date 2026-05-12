import express from 'express';
import middleware from '../../middleware/index.js';
import spo from '../../module/sales/spo.js';
import helper from '../../class/helper.class.js';

const router = express.Router();
const { auth } = middleware;

router.get('/approved-sprs', auth, async (req, res) => {
  const result = await spo.getApprovedSprs(req);
  return helper.sendResponse(res, result);
});

router.post('/', auth, async (req, res) => {
  const result = await spo.createSpo(req);
  return helper.sendResponse(res, result);
});

router.put('/:id/status', auth, async (req, res) => {
  const result = await spo.updateStatus(req);
  return helper.sendResponse(res, result);
});

router.get('/:id/sdo-history', auth, async (req, res) => {
  const result = await spo.getSdoHistory(req);
  return helper.sendResponse(res, result);
});

export default router;
