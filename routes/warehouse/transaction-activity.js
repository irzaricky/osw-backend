import express from 'express';
import transactionActivityModule from '../../module/warehouse/transaction-activity.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// list transaction activity
router.get('/', auth.sessionChecker, async (req, res) => {
  const result = await transactionActivityModule.list(req);
  helper.sendResponse(res, result);
});

// detail transaction activity
router.get('/:id', auth.sessionChecker, async (req, res) => {
  const result = await transactionActivityModule.detail(req);
  helper.sendResponse(res, result);
});

export default router;