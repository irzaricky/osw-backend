import express from 'express';
import placementModule from '../../module/warehouse/placement.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// 1. scan part label (VALIDATION ONLY)

router.get('/', auth.sessionChecker, async (req, res) => {
  const result = await placementModule.list(req);
  helper.sendResponse(res, result);
});

router.post('/:wo_id/scan-label', auth.sessionChecker, async (req, res) => {
  const result = await placementModule.validateLabel(req);
  helper.sendResponse(res, result);
});

router.get('/:wo_id', auth.sessionChecker, async (req, res) => {
  const result = await placementModule.detail(req);
  helper.sendResponse(res, result);
});

// 2. get available bins
router.get('/:wo_id/bins', auth.sessionChecker, async (req, res) => {
  const result = await placementModule.getAvailableBins(req);
  helper.sendResponse(res, result);
});

// 3. scan bin + placement
router.post('/:wo_id/place-bin', auth.sessionChecker, async (req, res) => {
  const result = await placementModule.placeBin(req);
  helper.sendResponse(res, result);
});

export default router;