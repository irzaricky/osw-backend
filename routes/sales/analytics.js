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

// GET /sales/analytics/sla
router.get('/sla', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await analytics.getSlaMetrics(req));
});

// GET /sales/analytics/forecast-vs-spo
router.get('/forecast-vs-spo', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await analytics.getForecastVsSpo(req));
});

// GET /sales/analytics/top-customers
router.get('/top-customers', session.sessionChecker, async (req, res) => {
  return helper.sendResponse(res, await analytics.getTopCustomers(req));
});

export default router;
