import express from "express";
import auth from "../../class/auth.class.js";
import analyticsModule from "../../module/production-plan/analytics.js";

const router = express.Router();

const permissionRequired = ['Superadmin', 'Supervisor PPIC'];

router.get('/executive-summary', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.executiveSummary(req, res);
});

router.get('/production-trend', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.productionTrend(req, res);
});

router.get('/line-utilization', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.lineUtilization(req, res);
});

router.get('/work-order-status', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.workOrderStatus(req, res);
});

router.get('/output-quality', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.outputQuality(req, res);
});

router.get('/downtime-by-type', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.downtimeByType(req, res);
});

router.get('/top-downtime-stations', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.topDowntimeStations(req, res);
});

router.get('/defect-by-type', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.defectByType(req, res);
});

router.get('/line-efficiency', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.lineEfficiencyRanking(req, res);
});

router.get('/on-time-delivery', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.onTimeDelivery(req, res);
});

router.get('/reschedule-frequency', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.rescheduleFrequency(req, res);
});

router.get('/capacity-feasibility', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.capacityFeasibility(req, res);
});

router.get('/issue-details', auth.sessionChecker, auth.permissionChecker(permissionRequired), async (req, res) => {
  await analyticsModule.issueDetails(req, res);
});

export default router;