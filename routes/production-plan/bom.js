import express from 'express';
import auth from '../../class/auth.class.js';
import bomModule from '../../module/production-plan/bom.js';

const router = express.Router();

// ── Dropdowns & Reference Data ───────────────────────────────────────────────

/** GET /bom/dd-doc-status
 *  List of document statuses (Draft, Pending Approval, Approved, Rejected) */
router.get('/dd-doc-status', auth.sessionChecker, async (req, res) => {
  await bomModule.getDocStatuses(req, res);
});

/** GET /bom/dd-activation-status
 *  List of activation statuses (Active, Inactive) */
router.get('/dd-activation-status', auth.sessionChecker, async (req, res) => {
  await bomModule.getActivationStatuses(req, res);
});

/** GET /bom/dropdown
 *  Lightweight BOM list for select inputs */
router.get('/dropdown', auth.sessionChecker, async (req, res) => {
  await bomModule.getDropdown(req, res);
});

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** GET /bom
 *  Paginated BOM list — filters: search, doc_status_id, activation_status_id, parent_part_id */
router.get('/', auth.sessionChecker, async (req, res) => {
  await bomModule.list(req, res);
});

/** POST /bom
 *  Create a new BOM (header + optional initial details) */
router.post('/', auth.sessionChecker, async (req, res) => {
  await bomModule.create(req, res);
});

/** GET /bom/:id
 *  Full BOM detail with all components, associations, and status info */
router.get('/:id', auth.sessionChecker, async (req, res) => {
  await bomModule.detail(req, res);
});

/** PUT /bom/:id
 *  Update BOM header fields (Draft only) */
router.put('/:id', auth.sessionChecker, async (req, res) => {
  await bomModule.update(req, res);
});

/** DELETE /bom/:id
 *  Soft-delete BOM (Draft only) */
router.delete('/:id', auth.sessionChecker, async (req, res) => {
  await bomModule.delete(req, res);
});

// ── BOM Details (Components) ─────────────────────────────────────────────────

/** POST /bom/:id/details
 *  Add a single component line to the BOM (Draft only) */
router.post('/:id/details', auth.sessionChecker, async (req, res) => {
  await bomModule.addDetail(req, res);
});

/** PUT /bom/:id/details/replace
 *  Bulk-replace ALL details at once — useful for drag-to-reorder saves (Draft only) */
router.put('/:id/details/replace', auth.sessionChecker, async (req, res) => {
  await bomModule.replaceDetails(req, res);
});

/** PUT /bom/:id/details/:detail_id
 *  Update a specific component line (Draft only) */
router.put('/:id/details/:detail_id', auth.sessionChecker, async (req, res) => {
  await bomModule.updateDetail(req, res);
});

/** DELETE /bom/:id/details/:detail_id
 *  Delete a specific component line (Draft only) */
router.delete('/:id/details/:detail_id', auth.sessionChecker, async (req, res) => {
  await bomModule.deleteDetail(req, res);
});

// ── Approval Workflow ─────────────────────────────────────────────────────────

/* POST /bom/:id/return-to-draft
  *  Return a Pending Approval BOM back to Draft for further edits */
router.post('/:id/return-to-draft', auth.sessionChecker, async (req, res) => {
  await bomModule.returnToDraft(req, res);
});

/** POST /bom/:id/submit
 *  Submit BOM for approval (Draft / Rejected → Pending Approval) */
router.post('/:id/submit', auth.sessionChecker, async (req, res) => {
  await bomModule.submit(req, res);
});

/** POST /bom/:id/approve
 *  Approve BOM (Pending Approval → Approved) */
router.post('/:id/approve', auth.sessionChecker, async (req, res) => {
  await bomModule.approve(req, res);
});

/** POST /bom/:id/reject
 *  Reject BOM with reason (Pending Approval → Rejected) */
router.post('/:id/reject', auth.sessionChecker, async (req, res) => {
  await bomModule.reject(req, res);
});

// ── Activation ────────────────────────────────────────────────────────────────

/** POST /bom/:id/activate
 *  Activate an approved BOM for use in production / MRP */
router.post('/:id/activate', auth.sessionChecker, async (req, res) => {
  await bomModule.activate(req, res);
});

/** POST /bom/:id/deactivate
 *  Deactivate a currently active BOM */
router.post('/:id/deactivate', auth.sessionChecker, async (req, res) => {
  await bomModule.deactivate(req, res);
});

// ── Versioning ────────────────────────────────────────────────────────────────

/** POST /bom/:id/new-version
 *  Clone an Approved BOM into a new Draft with bom_version + 1 */
router.post('/:id/new-version', auth.sessionChecker, async (req, res) => {
  await bomModule.newVersion(req, res);
});

export default router;