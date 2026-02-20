import express from 'express';
import warehouseModule from '../../module/master-data/warehouse.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get list warehouses
router.get('/', auth.sessionChecker, async (req, res) => {
    const result = await warehouseModule.list(req);
    helper.sendResponse(res, result);
});

// post add warehouse
router.post('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await warehouseModule.add(req);
    helper.sendResponse(res, result);
});

// put update warehouse
router.put('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await warehouseModule.update(req);
    helper.sendResponse(res, result);
});

// delete warehouse
router.delete('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await warehouseModule.delete(req);
    helper.sendResponse(res, result);
});

export default router;