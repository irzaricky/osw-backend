import express from 'express';
import auth from '../../class/auth.class.js';
import workOrderModule from '../../module/production-plan/work-order.js';

const router = express.Router();

// List, Summary & Detail

router.get('/', auth.sessionChecker, async (req, res) => {
  await workOrderModule.list(req, res);
});

router.get('/daily-summary', auth.sessionChecker, async (req, res) => {
  await workOrderModule.dailySummary(req, res);
});

router.get('/:id', auth.sessionChecker, async (req, res) => {
  await workOrderModule.detail(req, res);
});

// Execution

router.post('/:id/start', auth.sessionChecker, async (req, res) => {
  await workOrderModule.start(req, res);
});

router.post('/:id/complete', auth.sessionChecker, async (req, res) => {
  await workOrderModule.complete(req, res);
});

// Progress Reporting

router.get('/:id/progresses', auth.sessionChecker, async (req, res) => {
  await workOrderModule.getProgresses(req, res);
});

router.post('/:id/progresses', auth.sessionChecker, async (req, res) => {
  await workOrderModule.addProgress(req, res);
});

// Issue Reporting

router.get('/:id/issues', auth.sessionChecker, async (req, res) => {
  await workOrderModule.getIssues(req, res);
});

router.post('/:id/issues', auth.sessionChecker, async (req, res) => {
  await workOrderModule.reportIssue(req, res);
});

router.put('/:id/issues/:issue_id/resolve', auth.sessionChecker, async (req, res) => {
  await workOrderModule.resolveIssue(req, res);
});

// Station Status

router.put('/:id/stations/:station_id/status', auth.sessionChecker, async (req, res) => {
  await workOrderModule.updateStationStatus(req, res);
});

// Materials

router.get('/:id/materials', auth.sessionChecker, async (req, res) => {
  await workOrderModule.getMaterials(req, res);
});

router.put('/:id/materials/:material_id/actual', auth.sessionChecker, async (req, res) => {
  await workOrderModule.updateMaterialActual(req, res);
});

export default router;