import express from 'express';
import module from '../../module/material/mpr.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

// ============================================================
// PENTING: Urutan route di Express sangat berpengaruh!
// Route yang lebih spesifik (/dropdown/..., /bulk-review)
// HARUS diletakkan SEBELUM /:id
// ============================================================


// ============================================================
// DROPDOWN ENDPOINTS
// Cukup sudah login, tidak butuh permission khusus
// ============================================================

// Dropdown status PR untuk filter di halaman list
router.get(
  '/dropdown/status',
  session.sessionChecker,
  async (req, res) => {
    const result = await module.getDropdownStatuses(req);
    return helper.sendResponse(res, result);
  }
);

// Dropdown parts untuk input detail PR
// Support query: ?search=part_number_atau_nama
router.get(
  '/dropdown/parts',
  session.sessionChecker,
  async (req, res) => {
    const result = await module.getDropdownParts(req);
    return helper.sendResponse(res, result);
  }
);


// ============================================================
// LIST PR
// Support query params:
//   ?search=   → cari by nomor/deskripsi PR
//   ?status=   → filter by status (draft/submitted/approved/rejected)
//   ?type=     → filter by type (auto/manual)
//   ?page=     → halaman (default 1)
//   ?limit=    → jumlah per halaman (default 10)
// Aktor: Staff Material & Supervisor Material
// ============================================================
router.get(
  '/',
  session.sessionChecker,
  async (req, res) => {
    const result = await module.list(req);
    return helper.sendResponse(res, result);
  }
);


// ============================================================
// STAFF MATERIAL — MAKER
// Create Emergency, update, submit, delete
// ============================================================

// [POST] Buat Emergency PR secara manual (tanpa MRP)
// Body wajib: { description, details[] }
// details[]: { part_id, qty, required_date?, notes? }
// Body opsional: { save_as_draft }
//   save_as_draft: true  → simpan sebagai Draft (default)
//   save_as_draft: false → langsung Submitted ke Supervisor
router.post(
  '/',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Staff Material']),
  async (req, res) => {
    const result = await module.createEmergency(req);
    return helper.sendResponse(res, result);
  }
);

// [PUT] Submit PR Draft → Submitted
// Digunakan jika staff sebelumnya memilih Save as Draft
router.put(
  '/:id/submit',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Staff Material']),
  async (req, res) => {
    const result = await module.submit(req);
    return helper.sendResponse(res, result);
  }
);


// ============================================================
// SUPERVISOR MATERIAL — CHECKER
// PENTING: /bulk-review HARUS di atas /:id/review
// agar Express tidak menganggap 'bulk-review' sebagai nilai :id
// ============================================================

// [PUT] Approve/Reject BANYAK PR sekaligus (via checkbox di tabel)
// Body: { ids: [1,2,3], action: 'approve'|'reject', notes?: '...' }
// notes WAJIB diisi jika action = 'reject'
router.put(
  '/bulk-review',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Supervisor Material']),
  async (req, res) => {
    const result = await module.bulkReview(req);
    return helper.sendResponse(res, result);
  }
);

// [PUT] Approve/Reject SATU PR
// Body: { action: 'approve'|'reject', notes?: '...' }
// notes WAJIB diisi jika action = 'reject'
router.put(
  '/:id/review',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Supervisor Material']),
  async (req, res) => {
    const result = await module.review(req);
    return helper.sendResponse(res, result);
  }
);

// [PUT] Update header dan/atau detail PR
// Hanya bisa saat status draft atau submitted
// Body opsional: { description, details[], save_as_draft }
router.put(
  '/:id',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Staff Material']),
  async (req, res) => {
    const result = await module.update(req);
    return helper.sendResponse(res, result);
  }
);

// [DELETE] Hapus PR — hanya bisa saat status draft
router.delete(
  '/:id',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Staff Material']),
  async (req, res) => {
    const result = await module.deleteDraft(req);
    return helper.sendResponse(res, result);
  }
);


// ============================================================
// DETAIL PR
// Aktor: Staff Material & Supervisor Material
// ============================================================
router.get(
  '/:id',
  session.sessionChecker,
  async (req, res) => {
    const result = await module.detail(req);
    return helper.sendResponse(res, result);
  }
);


export default router;