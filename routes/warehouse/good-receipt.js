import express from 'express';
import goodReceiptModule from '../../module/warehouse/good-receipt.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get list good receipt
router.get('/', auth.sessionChecker, async (req, res) => {
  const result = await goodReceiptModule.list(req);
  helper.sendResponse(res, result);
});

// approve good receipt
router.post('/approve/:mr_id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await goodReceiptModule.approve(req);
  helper.sendResponse(res, result);
});

export default router;