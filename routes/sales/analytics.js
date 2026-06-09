import express from 'express';
import analytics from '../../module/sales/analytics.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

// GET /sales/analytics/summary
router.get('/summary', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await analytics.getSummary(req));
});

// GET /sales/analytics/trends
router.get('/trends', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await analytics.getTrends(req));
});

// GET /sales/analytics/forecast-export
router.get('/forecast-export', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return analytics.exportForecastDetails(req, res);
});

// GET /sales/analytics/spr-export
router.get('/spr-export', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return analytics.exportSprDetails(req, res);
});

// GET /sales/analytics/spo-export
router.get('/spo-export', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return analytics.exportSpoDetails(req, res);
});

// GET /sales/analytics/sdp-export
router.get('/sdp-export', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return analytics.exportSdpDetails(req, res);
});

// GET /sales/analytics/sdo-export
router.get('/sdo-export', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return analytics.exportSdoDetails(req, res);
});

// GET /sales/analytics/sla
router.get('/sla', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await analytics.getSlaMetrics(req));
});

// GET /sales/analytics/forecast-vs-spo
router.get('/forecast-vs-spo', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await analytics.getForecastVsSpo(req));
});

// GET /sales/analytics/top-customers
router.get('/top-customers', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await analytics.getTopCustomers(req));
});

// GET /sales/analytics/forecast
router.get('/forecast', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await analytics.getForecastAnalytics(req));
});

// GET /sales/analytics/spr
router.get('/spr', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await analytics.getSprAnalytics(req));
});

// GET /sales/analytics/spo
router.get('/spo', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await analytics.getSpoAnalytics(req));
});

// GET /sales/analytics/sdo
router.get('/sdo', session.sessionChecker, session.permissionChecker(['Superadmin', 'Supervisor Sales']), async (req, res) => {
  return helper.sendResponse(res, await analytics.getSdoAnalytics(req));
});

export default router;
