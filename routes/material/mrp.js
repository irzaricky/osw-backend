import express from 'express';
import module from '../../module/material/mrp.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

// ============================================================
// PENTING: Urutan route di Express sangat berpengaruh!
// Route yang lebih spesifik (misal /dropdown/..., /bulk-review,
// /sales-plan/:spr_id/load) HARUS diletakkan SEBELUM /:id
// agar tidak tertangkap sebagai parameter id.
// ============================================================


// ============================================================
// DROPDOWN ENDPOINTS
// Tidak butuh permission khusus, cukup sudah login
// Aktor: Staff Material & Supervisor Material
// ============================================================

// Dropdown Sales Plan (SPR) yang Approved/Waiting PPIC
// Dipakai di form Create MRP saat staff memilih Sales Plan
router.get(
  '/dropdown/sales-plans',
  session.sessionChecker,
  async (req, res) => {
    const result = await module.getDropdownSalesPlans(req);
    return helper.sendResponse(res, result);
  }
);

// Dropdown Parts/komponen untuk input detail MRP manual
// Support query: ?search=part_number_atau_nama
router.get(
  '/dropdown/parts',
  session.sessionChecker,
  async (req, res) => {
    const result = await module.getDropdownParts(req);
    return helper.sendResponse(res, result);
  }
);

// Dropdown status MRP untuk filter di halaman list
router.get(
  '/dropdown/status',
  session.sessionChecker,
  async (req, res) => {
    const result = await module.getDropdownStatuses(req);
    return helper.sendResponse(res, result);
  }
);

// Dropdown priority MRP (High, Medium, Low)
router.get(
  '/dropdown/priority',
  session.sessionChecker,
  async (req, res) => {
    const result = await module.getDropdownPriority(req);
    return helper.sendResponse(res, result);
  }
);


// ============================================================
// LOAD SALES PLAN DATA
// Dipanggil frontend SETELAH staff memilih Sales Plan di form.
// Response berisi: info SPR, daftar produk, kalkulasi material
// dari BOM, dan stok warehouse — semua dalam 1 request.
// Aktor: Staff Material
// ============================================================
router.get(
  '/sales-plan/:spr_id/load',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Staff Material']),
  async (req, res) => {
    const result = await module.loadSalesPlanData(req);
    return helper.sendResponse(res, result);
  }
);


// ============================================================
// LIST MRP
// Support query params:
//   ?search=   → cari by nomor/deskripsi MRP
//   ?status=   → filter by status (Draft/Submitted/Approved/Rejected)
//   ?spr_id=   → filter by Sales Plan
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
// Create, update, submit, delete
// ============================================================

// [POST] Buat MRP baru dari Sales Plan
// Body wajib: { description, details[] }
// Body opsional: { spr_id, production_plan_id, priority, notes, save_as_draft }
//   save_as_draft: true  → simpan sebagai Draft (default)
//   save_as_draft: false → langsung Submitted ke Supervisor
router.post(
  '/',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Staff Material']),
  async (req, res) => {
    const result = await module.createDraft(req);
    return helper.sendResponse(res, result);
  }
);

// [PUT] Submit MRP Draft → Submitted
// Digunakan jika staff sebelumnya memilih Save as Draft,
router.put(
  '/:id/submit',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Staff Material']),
  async (req, res) => {
    const result = await module.submit(req);
    return helper.sendResponse(res, result);
  }
);

// [PUT] Update detail items MRP (replace strategy)
// Hanya bisa saat status Draft atau Submitted
// Body: { details: [{ part_id, qty, bom_id?, notes? }] }
router.put(
  '/:id/detail',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Staff Material', 'Supervisor Material']),
  async (req, res) => {
    const result = await module.updateDetails(req);
    return helper.sendResponse(res, result);
  }
);

// ============================================================
// SUPERVISOR MATERIAL — CHECKER
// PENTING: /bulk-review dan /:id/review HARUS di atas PUT /:id
// agar Express tidak menganggap 'bulk-review' sebagai nilai :id
// ============================================================

// [PUT] Approve/Reject BANYAK MRP sekaligus (via checkbox di tabel)
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

// [PUT] Approve/Reject SATU MRP (via klik baris di tabel)
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

// [PUT] Update header MRP (description, priority, notes)
// Hanya bisa saat status Draft atau Submitted
// Body opsional: { description, priority, notes, save_as_draft }
router.put(
  '/:id',
  session.sessionChecker,
  session.permissionChecker(['Superadmin', 'Staff Material', 'Supervisor Material']),
  async (req, res) => {
    const result = await module.update(req);
    return helper.sendResponse(res, result);
  }
);

// [DELETE] Hapus MRP — hanya bisa saat status Draft
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
// DETAIL MRP
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