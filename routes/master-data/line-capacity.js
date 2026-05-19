import express from "express";
import auth from "../../class/auth.class.js";
import lineCapacityModule from "../../module/master-data/line-capacity.js";

const router = express.Router();

/** GET /line-capacity
 * List line capacities with optional filters: line_id, shift_id */
router.get("/:line_id/params", auth.sessionChecker, async (req, res) => {
  await lineCapacityModule.getParams(req, res);
});

/** POST /line-capacity
 * Create or update line capacity parameters for a line and shift */
router.post("/:line_id/calculate", auth.sessionChecker, async (req, res) => {
  await lineCapacityModule.calculate(req, res);
});

export default router;