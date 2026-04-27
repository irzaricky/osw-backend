import express from 'express';
import workOrderStoringModule from '../../module/warehouse/work-order-storing.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get dropdown work order storing type
router.get('/types/dropdown', auth.sessionChecker, async (req, res) => {
    const result = await workOrderStoringModule.getDropdownWorkOrderStoringType(req);
    helper.sendResponse(res, result);
});

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
router.get('/:id', auth.sessionChecker, async (req, res) => {
    const result = await workOrderStoringModule.detail(req);
    helper.sendResponse(res, result);
})

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
router.get('/print-label/:wo_item_id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    await workOrderStoringModule.printLabel(req, res);
});

export default router;