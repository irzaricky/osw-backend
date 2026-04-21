import express from 'express';
import workOrderStoringModule from '../../module/warehouse/work-order-storing.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get dropdown work order storing type

// get list work order storing
router.get('/', auth.sessionChecker, async (req, res) => {
    const result = await workOrderStoringModule.list(req);
    helper.sendResponse(res, result);
});

// post add work order storing
router.post('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await workOrderStoringModule.add(req);
    helper.sendResponse(res, result);
});

// get detail work order storing

// put update work order storing
router.put('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await workOrderStoringModule.update(req);
    helper.sendResponse(res, result);
});

// delete work order storing
router.delete('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await workOrderStoringModule.delete(req);
    helper.sendResponse(res, result);
});

// print part label

export default router;