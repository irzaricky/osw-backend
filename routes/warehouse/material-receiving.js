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

// get progress material receiving
router.get('/:id/progress', auth.sessionChecker, async (req, res) => {
  const result = await materialReceivingModule.progress(req);
  helper.sendResponse(res, result);
});

// get detail quantity checking
router.get('/quantity-checking/:mdo_detail_id', auth.sessionChecker, async (req, res) => {
  const result = await materialReceivingModule.quantityCheckingDetail(req);
  helper.sendResponse(res, result);
});

// post scan quantity checking
router.post('/quantity-checking/scan/:mr_item_id', auth.sessionChecker, async (req, res) => {
  const result = await materialReceivingModule.scanQuantityLabel(req);
  helper.sendResponse(res, result);
});

// patch mark quantity incomplete
router.patch('/quantity-checking/incomplete/:mr_item_label_id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await materialReceivingModule.markQuantityIncomplete(req);
  helper.sendResponse(res, result);
});

// patch edit quantity incomplete
router.patch('/quantity-checking/incomplete/:mr_item_label_id/edit', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await materialReceivingModule.editQuantityIncomplete(req);
  helper.sendResponse(res, result);
});

// post submit quantity checking
router.post('/quantity-checking/submit/:mdo_detail_id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await materialReceivingModule.submitQuantityChecking(req);
  helper.sendResponse(res, result);
});

// get detail quality checking
router.get('/quality-checking/:mdo_detail_id', auth.sessionChecker, async (req, res) => {
  const result = await materialReceivingModule.qualityCheckingDetail(req);
  helper.sendResponse(res, result);
});

// post scan quality checking
router.post('/quality-checking/scan/:mr_item_id', auth.sessionChecker, async (req, res) => {
  const result = await materialReceivingModule.scanQualityLabel(req);
  helper.sendResponse(res, result);
});

// patch mark quality defect
router.patch('/quality-checking/defect/:mr_item_label_id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await materialReceivingModule.markQualityDefect(req);
  helper.sendResponse(res, result);
});

// patch edit quality defect
router.patch('/quality-checking/defect/:mr_item_label_id/edit', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await materialReceivingModule.editQualityDefect(req);
  helper.sendResponse(res, result);
});

// post submit quality checking
router.post('/quality-checking/submit/:mdo_detail_id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  const result = await materialReceivingModule.submitQualityChecking(req);
  helper.sendResponse(res, result);
});

// print part label
router.get('/print-label/:mdo_detail_id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
  await materialReceivingModule.printLabel(req, res);
});

export default router;