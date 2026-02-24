import express from 'express';
import defectModule from '../../module/master-data/defect.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get dropdown defects
router.get('/dropdown', auth.sessionChecker, async (req, res) => {
    const result = await defectModule.getDropdownDefects(req);
    helper.sendResponse(res, result);
});

// get dropdown defect categories
router.get('/categories/dropdown', auth.sessionChecker, async (req, res) => {
    const result = await defectModule.getDropdownDefectCategories(req);
    helper.sendResponse(res, result);
});

// get list defects
router.get('/', auth.sessionChecker, async (req, res) => {
    const result = await defectModule.list(req);
    helper.sendResponse(res, result);
});

// post add defect
router.post('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await defectModule.add(req);
    helper.sendResponse(res, result);
});

// put update defect
router.put('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await defectModule.update(req);
    helper.sendResponse(res, result);
});

// delete defect
router.delete('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await defectModule.delete(req);
    helper.sendResponse(res, result);
});

// get list defect categories
router.get('/categories', auth.sessionChecker, async (req, res) => {
    const result = await defectModule.listDefectCategories(req);
    helper.sendResponse(res, result);
});

// post add defect category
router.post('/categories', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await defectModule.addDefectCategory(req);
    helper.sendResponse(res, result);
});

// put update defect category
router.put('/categories/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await defectModule.updateDefectCategory(req);
    helper.sendResponse(res, result);
});

// delete defect category
router.delete('/categories/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await defectModule.deleteDefectCategory(req);
    helper.sendResponse(res, result);
});

export default router;