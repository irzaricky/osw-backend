import express from "express";
import auth from "../../class/auth.class.js";
import productionPlanModule from "../../module/production-plan/plan.js";

const router = express.Router();

// ── Dropdown & Lookups ───────────────────────────────────────────────────────

/** GET /plan/dropdown
 *  Approved plans for PO creation dropdown */
router.get("/dropdown", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.getDropdown(req, res);
});

/** GET /plan/available-dos
 *  Confirmed DOs not yet allocated to any active plan */
router.get("/available-dos", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.getAvailableDeliveryOrders(req, res);
});

/**PUT /plan/:id/dos
 * Update DO references for a plan (Draft only) */
router.put("/:id/dos", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.syncDOs(req, res);
});

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** GET /plan
 *  Paginated list with optional filters: search, status, overall_status */
router.get("/", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.list(req, res);
});

/** POST /plan
 *  Create new plan from selected DO ids */
router.post("/", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.create(req, res);
});

/** GET /plan/:id
 *  Full plan detail with details, DO refs, capacity params/results, adjustments */
router.get("/:id", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.detail(req, res);
});

/** PUT /plan/:id
 *  Update plan header (Draft only) */
router.put("/:id", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.update(req, res);
});

/** DELETE /plan/:id
 *  Soft-delete (Draft only) */
router.delete("/:id", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.delete(req, res);
});

// ── Capacity Planning ─────────────────────────────────────────────────────────

/** POST /plan/:id/capacity-params
 *  Save or update capacity parameters for a line (BASE or ADJUSTED) */
router.post("/:id/capacity-params", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.saveCapacityParams(req, res);
});

/** POST /plan/:id/calculate
 *  Run capacity calculation engine for a given line */
router.post("/:id/calculate", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.calculateCapacity(req, res);
});

// ── Adjustments ───────────────────────────────────────────────────────────────

/** POST /plan/:id/adjustments
 *  Add a capacity adjustment record */
router.post("/:id/adjustments", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.addAdjustment(req, res);
});

/** DELETE /plan/:id/adjustments/:adj_id
 *  Remove a specific adjustment */
router.delete("/:id/adjustments/:adj_id", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.deleteAdjustment(req, res);
});

// ── Approval Workflow ─────────────────────────────────────────────────────────

/** POST /plan/:id/submit
 *  Staff submits plan for supervisor approval (Draft/Rejected → Pending_Approval) */
router.post("/:id/submit", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.submitForApproval(req, res);
});

/** POST /plan/:id/approve
 *  Supervisor approves plan (Pending_Approval → Approved) */
router.post("/:id/approve", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.approve(req, res);
});

/** POST /plan/:id/reject
 *  Supervisor rejects plan (Pending_Approval → Rejected) */
router.post("/:id/reject", auth.sessionChecker, async (req, res) => {
  await productionPlanModule.reject(req, res);
});

export default router;