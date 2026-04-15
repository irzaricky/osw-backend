import express from 'express';
import takeOutModule from '../../module/warehouse/take-out.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// list work order take out
router.get('/', auth.sessionChecker, async (req, res) => {
  const result = await takeOutModule.list(req);
  helper.sendResponse(res, result);
});

// detail work order take out
router.get('/:wo_id', auth.sessionChecker, async (req, res) => {
  const result = await takeOutModule.detail(req);
  helper.sendResponse(res, result);
});

// FIFO/FEFO recommendation
router.get('/:wo_id/recommendations', auth.sessionChecker, async (req, res) => {
  const result = await takeOutModule.recommendations(req);
  helper.sendResponse(res, result);
});

// scan label out
router.post('/:wo_id/scan-label', auth.sessionChecker, async (req, res) => {
  const result = await takeOutModule.scanLabelOut(req);
  helper.sendResponse(res, result);
});

export default router;