import express from 'express';
import auth from '../../class/auth.class.js';
import workOrderModule from '../../module/production-plan/work-order.js';

const router = express.Router();

// ── WO Line ───────────────────────────────────────────────────────────────────
// Static routes must be declared before /:id to avoid Express param capture

router.get('/daily-summary', auth.sessionChecker, async (req, res) => {
  await workOrderModule.dailySummary(req, res);
});

router.get('/monitor/live', auth.sessionChecker, async (req, res) => {
  await workOrderModule.liveMonitor(req, res);
});

router.get('/', auth.sessionChecker, async (req, res) => {
  await workOrderModule.list(req, res);
});

router.get('/:id', auth.sessionChecker, async (req, res) => {
  await workOrderModule.detail(req, res);
});

router.post('/:id/start', auth.sessionChecker, async (req, res) => {
  await workOrderModule.start(req, res);
});

router.get('/:id/materials/check', auth.sessionChecker, async (req, res) => {
  await workOrderModule.checkMaterials(req, res);
});

// ── WO Station ────────────────────────────────────────────────────────────────

router.get('/:id/stations/:station_id', auth.sessionChecker, async (req, res) => {
  await workOrderModule.stationDetail(req, res);
});

router.post('/:id/stations/:station_id/complete', auth.sessionChecker, async (req, res) => {
  await workOrderModule.completeStation(req, res);
});

router.put('/:id/stations/:station_id/status', auth.sessionChecker, async (req, res) => {
  await workOrderModule.updateStationStatus(req, res);
});

// ── Station Progress ──────────────────────────────────────────────────────────

router.get('/:id/stations/:station_id/progresses', auth.sessionChecker, async (req, res) => {
  await workOrderModule.getStationProgresses(req, res);
});

router.post('/:id/stations/:station_id/progresses', auth.sessionChecker, async (req, res) => {
  await workOrderModule.addStationProgress(req, res);
});

// ── Station Issues ────────────────────────────────────────────────────────────

router.get('/:id/stations/:station_id/issues', auth.sessionChecker, async (req, res) => {
  await workOrderModule.getStationIssues(req, res);
});

router.post('/:id/stations/:station_id/issues', auth.sessionChecker, async (req, res) => {
  await workOrderModule.reportStationIssue(req, res);
});

router.put('/:id/stations/:station_id/issues/:issue_id/resolve', auth.sessionChecker, async (req, res) => {
  await workOrderModule.resolveStationIssue(req, res);
});

// ── Station Materials ─────────────────────────────────────────────────────────

router.get('/:id/stations/:station_id/materials', auth.sessionChecker, async (req, res) => {
  await workOrderModule.getStationMaterials(req, res);
});

router.put('/:id/stations/:station_id/materials/:material_id/actual', auth.sessionChecker, async (req, res) => {
  await workOrderModule.updateStationMaterialActual(req, res);
});

export default router;