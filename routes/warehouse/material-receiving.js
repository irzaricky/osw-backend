import express from 'express';
import materialReceivingModule from '../../module/warehouse/material-receiving.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get dropdown material receiving
router.get('/dropdown', auth.sessionChecker, async (req, res) => {
    const result = await materialReceivingModule.dropdown(req, res);
    helper.sendResponse(res, result);
});

export default router;