import express from 'express';
import warrantyAndClaimModule from '../../module/warehouse/warranty-and-claim.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get list warranty and claim
router.get('/', auth.sessionChecker, async (req, res) => {
  const result = await warrantyAndClaimModule.list(req);
  helper.sendResponse(res, result);
});

export default router;
