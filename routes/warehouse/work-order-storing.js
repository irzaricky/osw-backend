import express from 'express';
import workOrderStoringModule from '../../module/warehouse/work-order-storing.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get list work order storing
router.get('/', auth.sessionChecker, async (req, res) => {
    const result = await workOrderStoringModule.list(req);
    helper.sendResponse(res, result);
});

export default router;