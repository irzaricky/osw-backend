import express from 'express';
import warehouseAnalyticsModule from '../../module/warehouse/analytics.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

router.get('/executive-summary', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.executiveSummary(req);
  helper.sendResponse(res, result);
});

router.get('/stock-movement', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.stockMovement(req);
  helper.sendResponse(res, result);
});

router.get('/fast-moving', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.fastMoving(req);
  helper.sendResponse(res, result);
});

router.get('/slow-moving', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.slowMoving(req);
  helper.sendResponse(res, result);
});

router.get('/utilization', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.utilization(req);
  helper.sendResponse(res, result);
});
router.get('/fifo-compliance', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.fifoCompliance(req)
  helper.sendResponse(res, result)
})
router.get('/fifo-violation-details', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.fifoViolationDetails(req)
  helper.sendResponse(res, result)
})
router.get('/aging-distribution', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.agingDistribution(req)
  helper.sendResponse(res, result)
})
router.get('/inventory-value', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.inventoryValue(req);
  helper.sendResponse(res, result);
});

router.get('/top-inventory-value', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.topInventoryValue(req);
  helper.sendResponse(res, result);
});
router.get('/inventory-health', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.inventoryHealth(req)
  helper.sendResponse(res, result)
})

router.get('/critical-parts', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.criticalParts(req)
  helper.sendResponse(res, result)
})
router.get('/inventory-cost-by-type', auth.sessionChecker, async (req, res) => {
  const result = await warehouseAnalyticsModule.inventoryCostByType(req);
  helper.sendResponse(res, result);
});

export default router;