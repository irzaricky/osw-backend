import express from 'express';
import dockModule from '../../module/master-data/dock.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get dropdown warehouse areas
router.get('/dd-areas', auth.sessionChecker, async (req, res) => {
    const result = await dockModule.getDropdownWarehouseAreas(req);
    helper.sendResponse(res, result);
});

// get list docks
router.get('/', auth.sessionChecker, async (req, res) => {
    const result = await dockModule.list(req);
    helper.sendResponse(res, result);
});

// post add warehouse
router.post('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await dockModule.add(req);
    helper.sendResponse(res, result);
});

// put update warehouse
router.put('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await dockModule.update(req);
    helper.sendResponse(res, result);
});

// delete warehouse
router.delete('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await dockModule.delete(req);
    helper.sendResponse(res, result);
});

export default router;