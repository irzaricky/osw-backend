import express from 'express';
import materialReceivingModule from '../../module/warehouse/material-receiving.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get dropdown material receiving
router.get('/dropdown', auth.sessionChecker, async (req, res) => {
  const result = await materialReceivingModule.dropdown(req, res);
  helper.sendResponse(res, result);
});

// get dropdown material receiving status
router.get('/statuses/dropdown', auth.sessionChecker, async (req, res) => {
  const result = await materialReceivingModule.getDropdownMaterialReceivingStatus(req);
  helper.sendResponse(res, result);
});

// get list material receiving
router.get('/', auth.sessionChecker, async (req, res) => {
  const result = await materialReceivingModule.list(req);
  helper.sendResponse(res, result);
});

// get detail material receiving
router.get('/:id', auth.sessionChecker, async (req, res) => {
  const result = await materialReceivingModule.detail(req);
  helper.sendResponse(res, result);
});

// post arrived material receiving
router.post('/:id/arrived', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await materialReceivingModule.arrived(req);
  helper.sendResponse(res, result);
});

// print part label
router.get('/print-label/:mdo_detail_id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  await materialReceivingModule.printLabel(req, res);
});

export default router;