import express from 'express';
import stockMonitoringModule from '../../module/warehouse/stock-monitoring.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

router.get('/summary', auth.sessionChecker, async (req, res) => {
  const result = await stockMonitoringModule.summary(req);
  helper.sendResponse(res, result);
});

router.get('/parts', auth.sessionChecker, async (req, res) => {
  const result = await stockMonitoringModule.stockByPart(req);
  helper.sendResponse(res, result);
});

router.get('/parts/:part_number', auth.sessionChecker, async (req, res) => {
  const result = await stockMonitoringModule.stockPartDetail(req);
  helper.sendResponse(res, result);
});

router.get('/bins', auth.sessionChecker, async (req, res) => {
  const result = await stockMonitoringModule.stockByBin(req);
  helper.sendResponse(res, result);
});

router.get('/bins/:bin_id', auth.sessionChecker, async (req, res) => {
  const result = await stockMonitoringModule.stockBinDetail(req);
  helper.sendResponse(res, result);
});

export default router;