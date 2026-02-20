import express from 'express';
import warehouseBinsModule from '../../module/master-data/warehouse_bins.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

router.get('/', auth.sessionChecker, async (req, res) => {
  const result = await warehouseBinsModule.list(req);
  helper.sendResponse(res, result);
});

router.post(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin']),
  async (req, res) => {
    const result = await warehouseBinsModule.add(req);
    helper.sendResponse(res, result);
  }
);

router.put(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin']),
  async (req, res) => {
    const result = await warehouseBinsModule.update(req);
    helper.sendResponse(res, result);
  }
);

router.delete(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin']),
  async (req, res) => {
    const result = await warehouseBinsModule.delete(req);
    helper.sendResponse(res, result);
  }
);

export default router;