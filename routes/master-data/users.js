import express from 'express';
import userModule from '../../module/master-data/user.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get dropdown roles
router.get('/dd-roles', auth.sessionChecker, async (req, res) => {
    const result = await userModule.getDropdownRoles(req);
    helper.sendResponse(res, result);
});

// get dropdown divisions
router.get('/dd-divisi', auth.sessionChecker, async (req, res) => {
    const result = await userModule.getDropdownDivisions(req);
    helper.sendResponse(res, result);
});

// get dropdown status
router.get('/dd-status', auth.sessionChecker, async (req, res) => {
    const result = await userModule.getDropdownStatus(req);
    helper.sendResponse(res, result);
});

// get dropdown factories
router.get('/dd-factory', auth.sessionChecker, async (req, res) => {
    const result = await userModule.getDropdownFactories(req);
    helper.sendResponse(res, result);
});

// get dropdown lines
router.get('/dd-lines', auth.sessionChecker, async (req, res) => {
    const result = await userModule.getDropdownLines(req);
    helper.sendResponse(res, result);
});


// get list user
router.get('/', auth.sessionChecker, async (req, res) => {
    const result = await userModule.list(req);
    helper.sendResponse(res, result);
});

// post add user
router.post('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await userModule.add(req);
    helper.sendResponse(res, result);
});

// put update user
router.put('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await userModule.update(req);
    helper.sendResponse(res, result);
});

// patch update status user
router.patch('/status/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await userModule.updateStatus(req);
    helper.sendResponse(res, result);
});

// delete user
router.delete('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await userModule.delete(req);
    helper.sendResponse(res, result);
});

// get download user
router.get('/download', auth.sessionChecker, async (req, res) => {
    await userModule.download(req, res);
});

export default router;
