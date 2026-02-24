import express from 'express';
import warehouseAreaModule from '../../module/master-data/warehouse_area.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get dropdown warehouse areas
router.get('/dropdown', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAreaModule.getDropdown(req);
  helper.sendResponse(res, result);
});

// get list warehouse areas
router.get('/', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAreaModule.list(req);
  helper.sendResponse(res, result);
});

// post add warehouse area
router.post(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin']),
  async (req, res) => {
    const result = await warehouseAreaModule.add(req);
    helper.sendResponse(res, result);
  }
);

// put update warehouse area
router.put(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin']),
  async (req, res) => {
    const result = await warehouseAreaModule.update(req);
    helper.sendResponse(res, result);
  }
);

// delete warehouse area
router.delete(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin']),
  async (req, res) => {
    const result = await warehouseAreaModule.delete(req);
    helper.sendResponse(res, result);
  }
);

export default router;
