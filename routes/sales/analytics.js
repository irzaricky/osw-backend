import express from 'express';
import analytics from '../../module/sales/analytics.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

// GET /sales/analytics/summary
router.get('/summary', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await analytics.getSummary(req));
});

// GET /sales/analytics/trends
router.get('/trends', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await analytics.getTrends(req));
});

// GET /sales/analytics/export
router.get('/export', session.sessionChecker, async (req, res) => {
  return analytics.exportSDODetails(req, res);
});

export default router;
