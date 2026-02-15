import express from 'express';
import logModule from '../../module/master-data/log.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// GET list logs
router.get('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await logModule.list(req);
    helper.sendResponse(res, result);
});

// GET log detail
router.get('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await logModule.detail(req);
    helper.sendResponse(res, result);
});

export default router;
