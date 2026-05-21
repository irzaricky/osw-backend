import express from 'express';
import mdo from '../../module/material/mdo.js';
import helper from '../../class/helper.class.js';
import session from '../../class/auth.class.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────

// GET /dd-status
// Kembalikan list status MDO (draft, scheduled, in_transit, arrived)
router.get('/dd-status', session.sessionChecker, async (req, res) => {
  const result = await mdo.getDropdownStatuses(req);
  return helper.sendResponse(res, result);
});

// GET /dd-warehouses
// Kembalikan list gudang (khusus gudang material / selain WIP & Product)
router.get('/dd-warehouses', session.sessionChecker, async (req, res) => {
  const result = await mdo.getDropdownWarehouses(req);
  return helper.sendResponse(res, result);
});

// GET /dd-mpo
// Kembalikan list MPO yang statusnya approved (untuk dropdown pilih MPO di form)
router.get('/dd-mpo', session.sessionChecker, async (req, res) => {
  const result = await mdo.getDropdownMpo(req);
  return helper.sendResponse(res, result);
});

// GET /dd-docks?date=YYYY-MM-DD&exclude_id=N
// Kembalikan semua dock beserta slot jam; slot yang sudah terpakai: available = false
// exclude_id diisi dengan id MDO yang sedang diedit agar slotnya tidak ikut dikunci
router.get('/dd-docks', session.sessionChecker, async (req, res) => {
  const result = await mdo.getDropdownDocks(req);
  return helper.sendResponse(res, result);
});

// GET /dd-vehicles?date=YYYY-MM-DD&exclude_id=N
// Kembalikan kendaraan yang tidak dipakai pada H-1 dari tanggal yang dipilih
router.get('/dd-vehicles', session.sessionChecker, async (req, res) => {
  const result = await mdo.getDropdownVehicles(req);
  return helper.sendResponse(res, result);
});


// GET /preview-split
// Endpoint bantuan untuk frontend menghitung otomatis qty berdasarkan kapasitas truk
router.get('/preview-split', session.sessionChecker, async (req, res) => {
  const result = await mdo.previewSplit(req);
  return helper.sendResponse(res, result);
});

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /?page=1&limit=10&status=draft&search=MDO-
// List semua MDO dengan pagination, filter status, dan pencarian nomor
router.get('/', session.sessionChecker, async (req, res) => {
  const result = await mdo.list(req);
  return helper.sendResponse(res, result);
});

// POST /
// Buat MDO baru
// Body: { mpo_id, dock_id, target_date, target_time, vehicle_id,
//         transporter, description, remarks, details[], save_as }
// save_as: 'draft' (default) | 'scheduled'
router.post('/', session.sessionChecker, async (req, res) => {
  const result = await mdo.create(req);
  return helper.sendResponse(res, result);
});

// GET /:id
// Detail satu MDO lengkap dengan relasi
router.get('/:id', session.sessionChecker, async (req, res) => {
  const result = await mdo.detail(req);
  return helper.sendResponse(res, result);
});

// PUT /:id
// Edit MDO — hanya bisa jika status masih 'draft'
// Body sama seperti POST; kirim save_as: 'scheduled' untuk langsung submit
router.put('/:id', session.sessionChecker, async (req, res) => {
  const result = await mdo.update(req);
  return helper.sendResponse(res, result);
});

// DELETE /:id
// Soft-delete MDO — hanya bisa jika status masih 'draft'
router.delete('/:id', session.sessionChecker, async (req, res) => {
  const result = await mdo.delete(req);
  return helper.sendResponse(res, result);
});

// PUT /:id/status
// Maju-kan status: scheduled → in_transit → arrived
// Status setelah 'arrived' dilanjutkan oleh modul t_material_receiving
router.put('/:id/status', session.sessionChecker, async (req, res) => {
  const result = await mdo.updateStatus(req);
  return helper.sendResponse(res, result);
});

export default router;