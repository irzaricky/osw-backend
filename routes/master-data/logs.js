import express from 'express';
import logModule from '../../module/master-data/log.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// GET download logs
router.get('/download', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await logModule.download(req);
    
    if (result.status) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.data);
    } else {
        helper.sendResponse(res, result);
    }
});

// GET dropdown modules
router.get('/dd-modules', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await logModule.getDropdownModules();
    helper.sendResponse(res, result);
});

// GET dropdown activities
router.get('/dd-activity', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await logModule.getDropdownActivity();
    helper.sendResponse(res, result);
});

// GET dropdown users
router.get('/dd-users', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await logModule.getDropdownUsers();
    helper.sendResponse(res, result);
});

// GET list logs
router.get('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await logModule.list(req);
    helper.sendResponse(res, result);
});

// GET log detail
router.get('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await logModule.detail(req);
    helper.sendResponse(res, result);
});

export default router;
