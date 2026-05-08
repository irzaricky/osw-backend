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

// post add warehouse layout
router.post('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.add(req);
  helper.sendResponse(res, result);
});

// get detail warehouse layout
router.get('/:id', auth.sessionChecker, async (req, res) => {
  const result = await warehouseLayoutModule.detail(req);
  helper.sendResponse(res, result);
});

// post add area layout
router.post('/:id/area-layout', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.addAreaLayout(req);
  helper.sendResponse(res, result);
});

// post add area spacing
router.post('/area-spacing', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.addAreaSpacing(req);
  helper.sendResponse(res, result);
});

// patch move area layout
router.patch('/area-layout/:id/move', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.moveAreaLayout(req);
  helper.sendResponse(res, result);
});

// put update area spacing
router.put('/area-spacing/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.updateAreaSpacing(req);
  helper.sendResponse(res, result);
});

// delete area layout
router.delete('/area-layout/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.deleteAreaLayout(req);
  helper.sendResponse(res, result);
});

// delete area spacing
router.delete('/area-spacing/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await warehouseLayoutModule.deleteAreaSpacing(req);
  helper.sendResponse(res, result);
});

export default router;