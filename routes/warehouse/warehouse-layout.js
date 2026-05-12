import express from 'express';
import warehouseLayoutModule from '../../module/warehouse/warehouse-layout.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get list warehouse layout
router.get('/', auth.sessionChecker, async (req, res) => {
  const result = await warehouseLayoutModule.list(req);
  helper.sendResponse(res, result);
});

// get detail warehouse layout
router.get('/:id', auth.sessionChecker, async (req, res) => {
  const result = await warehouseLayoutModule.detail(req);
  helper.sendResponse(res, result);
});

// post add warehouse layout
router.post('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.add(req);
  helper.sendResponse(res, result);
});

// get detail area layout
router.get('/area-layout/:id', auth.sessionChecker, async (req, res) => {
  const result = await warehouseLayoutModule.detailAreaLayout(req);
  helper.sendResponse(res, result);
});

// post add area layout
router.post('/:id/area-layout', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.addAreaLayout(req);
  helper.sendResponse(res, result);
});

// put update area layout
router.put('/area-layout/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.updateAreaLayout(req);
  helper.sendResponse(res, result);
});

// delete area layout
router.delete('/area-layout/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.deleteAreaLayout(req);
  helper.sendResponse(res, result);
});

// get detail storage bin
router.get('/storage-bin/:id', auth.sessionChecker, async (req, res) => {
  const result = await warehouseLayoutModule.detailStorageBin(req);
  helper.sendResponse(res, result);
});

export default router;