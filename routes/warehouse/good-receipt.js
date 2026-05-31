import express from 'express';
import goodReceiptModule from '../../module/warehouse/good-receipt.js';
import session from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get list good receipt
router.get('/', session.sessionChecker, session.permissionChecker(['Superadmin', 'Admin Warehouse', 'Supervisor Warehouse']), async (req, res) => {
  const result = await goodReceiptModule.list(req);
  helper.sendResponse(res, result);
});

// get detail good receipt
router.get('/:mr_id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Admin Warehouse', 'Supervisor Warehouse']), async (req, res) => {
  const result = await goodReceiptModule.detail(req);
  helper.sendResponse(res, result);
});

// post approve good receipt
router.post('/approve/:mr_id', session.sessionChecker, session.permissionChecker(['Superadmin', 'Admin Warehouse', 'Supervisor Warehouse']), async (req, res) => {
  const result = await goodReceiptModule.approve(req);
  helper.sendResponse(res, result);
});

export default router;