import express from 'express';
import customerModule from '../../module/master-data/customer.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// GET download customers
router.get('/download', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await customerModule.download(req);
    
    if (result.status) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.data);
    } else {
        helper.sendResponse(res, result);
    }
});

// GET list customers
router.get('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await customerModule.list(req);
    helper.sendResponse(res, result);
});

// POST add customer
router.post('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await customerModule.add(req);
    helper.sendResponse(res, result);
});

// PUT update customer
router.put('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await customerModule.update(req);
    helper.sendResponse(res, result);
});

// DELETE delete customer
router.delete('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin*']), async (req, res) => {
    const result = await customerModule.delete(req);
    helper.sendResponse(res, result);
});

export default router;
