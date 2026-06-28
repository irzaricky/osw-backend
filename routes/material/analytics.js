import express from 'express';
import materialAnalytics from '../../module/material/analytics.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

// GET /material/analytics/mrp
router.get('/mrp', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Material']), async (req, res) => {
  return helper.sendResponse(res, await materialAnalytics.getMrpAnalytics(req));
});

// GET /material/analytics/mpr
router.get('/mpr', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Material']), async (req, res) => {
  return helper.sendResponse(res, await materialAnalytics.getMprAnalytics(req));
});

// GET /material/analytics/mpo
router.get('/mpo', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Material']), async (req, res) => {
  return helper.sendResponse(res, await materialAnalytics.getMpoAnalytics(req));
});

// GET /material/analytics/mdo
router.get('/mdo', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Material']), async (req, res) => {
  return helper.sendResponse(res, await materialAnalytics.getMdoAnalytics(req));
});

export default router;