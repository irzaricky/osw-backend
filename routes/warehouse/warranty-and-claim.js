import express from 'express';
import warrantyAndClaimModule from '../../module/warehouse/warranty-and-claim.js';
import session from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get list warranty and claim
router.get('/', session.sessionChecker, session.permissionChecker(['Superadmin', 'Admin Warehouse', 'Warehouse Staff']), async (req, res) => {
  const result = await warrantyAndClaimModule.list(req);
  helper.sendResponse(res, result);
});

// get dropdown parts for warranty and claim filters
router.get('/dropdown/parts', session.sessionChecker, session.permissionChecker(['Superadmin', 'Admin Warehouse', 'Warehouse Staff']), async (req, res) => {
  const result = await warrantyAndClaimModule.getDropdownParts(req);
  helper.sendResponse(res, result);
});

// get dropdown suppliers for warranty and claim filters
router.get('/dropdown/suppliers', session.sessionChecker, session.permissionChecker(['Superadmin', 'Admin Warehouse', 'Warehouse Staff']), async (req, res) => {
  const result = await warrantyAndClaimModule.getDropdownSuppliers(req);
  helper.sendResponse(res, result);
});

export default router;