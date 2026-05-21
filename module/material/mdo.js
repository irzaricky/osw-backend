/**
 * module/material/mdo.js
 *
 * Business logic untuk Material Delivery Order (MDO).
 *
 * PERUBAHAN UTAMA v2:
 * ─────────────────────────────────────────────────────────────────────────────
 * • 1 MPO kini bisa memiliki BANYAK MDO.
 * • Setiap MDO terikat pada 1 kendaraan dengan kapasitas tertentu
 *   (ref_vehicle_types.load_capacity, dalam kg).
 * • Endpoint `GET /preview-split` menghitung otomatis pembagian qty
 *   ke dalam satu MDO berdasarkan vehicle yang dipilih.
 *   - Berat muatan = SUM(detail.qty × part.weight)
 *   - Jika total berat MPO melebihi kapasitas, qty tiap part dibagi rata
 *     hingga pas memenuhi kapasitas kendaraan tersebut (proporsional).
 *   - Part yang belum punya weight = 0 (dianggap ringan), dicatat sebagai
 *     warning agar tim master-data segera mengisi.
 * • Validasi create/update kini memeriksa:
 *   - Apakah vehicle sudah dipakai MDO lain pada tanggal yang sama.
 *   - Apakah total berat detail melebihi load_capacity kendaraan.
 *   - Apakah qty tiap detail tidak melebihi sisa qty MPO yang belum
 *     ter-cover oleh MDO lain (remaining_qty per part).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Op, fn, col, literal } from 'sequelize';
import db from '../../models/index.js';

const {
  SMaterialDeliveryOrder,
  SMaterialPurchaseOrder,
  TMaterialPurchaseOrderDetail,
  TMaterialDeliveryOrderDetail,
  SVehicles,
  RefVehicleType,
  SDocks,
  SWarehouses,
  SWarehouseAreas,
  SParts,
  SUom,
  sequelize,
} = db;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate nomor MDO: MDO-YYYYMMDD-XXXX
 */
async function generateMdoNumber(date) {
  const prefix = `MDO-${date.replace(/-/g, '')}`;
  const last = await SMaterialDeliveryOrder.findOne({
    where: { number: { [Op.like]: `${prefix}%` } },
    order: [['number', 'DESC']],
    paranoid: false,
  });
  const seq = last
    ? String(parseInt(last.number.split('-')[2] || '0', 10) + 1).padStart(4, '0')
    : '0001';
  return `${prefix}-${seq}`;
}

/**
 * Hitung sisa qty per part_id dari sebuah MPO yang belum ter-cover MDO.
 * exclude_mdo_id: abaikan MDO ini saat menghitung (dipakai waktu edit).
 *
 * FIX v3: Tarik data lewat tabel induk (findByPk) dengan include nested
 * agar Sequelize tidak melakukan auto-deduplication/squashing pada tabel
 * detail yang tidak memiliki primary key unik.
 *
 * Returns: Map<part_id, { ordered_qty, covered_qty, remaining_qty, part }>
 */
async function getRemainingQtyMap(mpo_id, exclude_mdo_id = null) {
  // ── 1. Tarik MPO induk beserta semua detail-nya via include nested ──────────
  //    Dengan findByPk + include, Sequelize membangun nested object yang benar
  //    (tidak flatten/squash), sehingga semua baris detail terbaca utuh.
  const mpo = await SMaterialPurchaseOrder.findByPk(mpo_id, {
    include: [
      {
        model: TMaterialPurchaseOrderDetail,
        as: 'details',
        include: [
          {
            model: SParts,
            as: 'part',
            attributes: ['id', 'part_number', 'part_name', 'weight', 'uom_id'],
          },
        ],
      },
    ],
  });

  // MPO tidak ditemukan → kembalikan Map kosong
  if (!mpo) return new Map();

  const mpoDetails = mpo.details ?? [];

  // ── 2. Ambil semua MDO detail yang sudah ada untuk MPO ini ──────────────────
  const existingMdoDetails = await TMaterialDeliveryOrderDetail.findAll({
    include: [
      {
        model: SMaterialDeliveryOrder,
        as: 'mdo',
        where: exclude_mdo_id
          ? { mpo_id, id: { [Op.ne]: exclude_mdo_id } }
          : { mpo_id },
        attributes: [],
      },
    ],
    raw: true,
  });

  // ── 3. Hitung covered_qty per part dari MDO yang sudah ada ──────────────────
  const coveredMap = {};
  for (const d of existingMdoDetails) {
    coveredMap[d.part_id] = (coveredMap[d.part_id] || 0) + parseFloat(d.qty);
  }

  // ── 4. Build result Map — akumulasi jika part_id kembar dalam detail MPO ────
  //    Karena sudah pakai include nested (bukan raw), d.part adalah object biasa.
  const result = new Map();
  for (const d of mpoDetails) {
    const ordered = parseFloat(d.qty);
    const part = d.part
      ? {
          id:          d.part.id,
          part_number: d.part.part_number,
          part_name:   d.part.part_name,
          weight:      d.part.weight,
          uom_id:      d.part.uom_id,
        }
      : null;

    if (result.has(d.part_id)) {
      // Akumulasi qty jika part_id sama muncul lebih dari 1 baris
      const existing = result.get(d.part_id);
      existing.ordered_qty  += ordered;
      existing.remaining_qty = Math.max(0, existing.ordered_qty - existing.covered_qty);
    } else {
      const covered = coveredMap[d.part_id] || 0;
      result.set(d.part_id, {
        ordered_qty:   ordered,
        covered_qty:   covered,
        remaining_qty: Math.max(0, ordered - covered),
        part,
      });
    }
  }

  return result;
}

/**
 * Hitung total berat dari array detail: [{ qty, part: { weight } }]
 * Returns: { total_weight_kg, has_missing_weight, missing_weight_parts }
 */
function calcTotalWeight(details) {
  let total = 0;
  const missing = [];
  for (const d of details) {
    const w = parseFloat(d.part?.weight ?? 0);
    if (!d.part?.weight) missing.push(d.part?.part_number ?? `part_id:${d.part_id}`);
    total += parseFloat(d.qty) * w;
  }
  return {
    total_weight_kg: total,
    has_missing_weight: missing.length > 0,
    missing_weight_parts: missing,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────

async function getDropdownStatuses() {
  return {
    status: true,
    data: [
      { value: 'draft', label: 'Draft' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'in_transit', label: 'In Transit' },
      { value: 'arrived', label: 'Arrived' },
    ],
  };
}

async function getDropdownMpo(req) {
  const { search, mpo_id } = req.query;

  // ── 1. Bangun kondisi WHERE ───────────────────────────────────────────────
  const where = { status: 'approved' };
  if (search) where.number = { [Op.like]: `%${search}%` };

  // Syarat ke-4: Jika user sedang edit MDO yang terikat ke mpo_id tertentu,
  // pastikan MPO itu selalu muncul di dropdown meski sudah tidak ada sisa
  // (ditangani nanti di bagian filter result, bukan di WHERE query).

  // ── 2. Ambil header MPO beserta supplier ─────────────────────────────────
  // WAJIB pakai db.SSuppliers (bukan SSuppliers), karena tidak ada
  // di destructuring atas — jika tidak, Node akan lempar ReferenceError.
  const rows = await SMaterialPurchaseOrder.findAll({
    where,
    attributes: ['id', 'number', 'description', 'supplier_id'],
    include: [
      {
        model: db.SSuppliers,   // ← FIXED: pakai db.SSuppliers
        as: 'supplier',
        attributes: ['name'],
      },
    ],
    order: [['number', 'ASC']],
    limit: 50,
  });

  // ── 3. Loop tiap MPO, hitung sisa qty per part ───────────────────────────
  const result = [];

  for (const r of rows) {
    const remainingMap = await getRemainingQtyMap(r.id);  // ← Syarat ke-2

    // Kumpulkan parts yang masih punya sisa ke dalam array `details`
    const details = [];
    for (const [partId, val] of remainingMap.entries()) {
      if (val.remaining_qty > 0) {
        details.push({
          id: partId,
          part_name: val.part?.part_name,
          part_number: val.part?.part_number,
          ordered_qty: val.ordered_qty,
          remaining_qty: val.remaining_qty,
          weight: val.part?.weight ?? null,
        });
      }
    }

    // ── 4. Filter: tampilkan MPO jika...
    //    a) masih ada sisa barang (details.length > 0), ATAU
    //    b) ini adalah MPO yang sedang aktif diedit user (mpo_id dari query)
    //       → Syarat ke-4: jangan hilangkan MPO yang sedang dipakai
    const isCurrentlyEdited = mpo_id && String(r.id) === String(mpo_id);

    if (details.length > 0 || isCurrentlyEdited) {
      result.push({
        id: r.id,
        number: r.number,
        description: r.description,
        supplier_name: r.supplier?.name ?? null,
        details,           // ← Syarat ke-3: `details` WAJIB di dalam object MPO
      });
    }
  }

  return { status: true, data: result };
}

/**
 * Ambil daftar warehouse material.
 * Main Material Warehouse = id 1.
 */
async function getDropdownWarehouses(req) {
  const warehouses = await SWarehouses.findAll({
    where: { id: 1 },
    attributes: ['id', 'warehouse_code', 'name'],
    order: [['name', 'ASC']],
  });

  return { status: true, data: warehouses };
}

/**
 * Ambil daftar loading dock yang:
 * 1. Berada di area milik Main Material Warehouse (warehouse_id: 1)
 * 2. Masih kosong / belum dibooking pada target_date yang dipilih
 */
async function getDropdownDocks(req) {
  const { date, exclude_id } = req.query;
  if (!date) return { status: false, message: 'Parameter date wajib diisi.' };

  // ── 1. Ambil area yang berada di Main Material Warehouse (id: 1) ─────────
  const materialAreas = await SWarehouseAreas.findAll({
    where: { warehouse_id: 1 },
    attributes: ['id'],
  });
  const materialAreaIds = materialAreas.map((a) => a.id);

  if (!materialAreaIds.length) {
    return { status: true, data: [] }; // belum ada area di warehouse material
  }

  // ── 3. Dock yang sudah dibooking pada tanggal tersebut ───────────────────
  const bookedRecords = await SMaterialDeliveryOrder.findAll({
    where: {
      target_date: date,
      status: { [Op.notIn]: ['draft'] },
      dock_id: { [Op.ne]: null },
      ...(exclude_id ? { id: { [Op.ne]: exclude_id } } : {}),
    },
    attributes: ['dock_id', 'target_time'],
  });

  const bookedMap = {};
  for (const m of bookedRecords) {
    if (!bookedMap[m.dock_id]) bookedMap[m.dock_id] = new Set();
    bookedMap[m.dock_id].add(m.target_time);
  }

  // ── 4. Ambil dock khusus dari area material warehouse ────────────────────
  const docks = await SDocks.findAll({
    where: { area_id: { [Op.in]: materialAreaIds } },
    include: [
      {
        model: SWarehouseAreas,
        as: 'area',
        attributes: ['id', 'name', 'warehouse_id'],
      },
    ],
    order: [['name', 'ASC']],
  });

  const data = docks.map((dock) => ({
    id: dock.id,
    name: dock.name,
    area: dock.area
      ? { id: dock.area.id, name: dock.area.name, warehouse_id: dock.area.warehouse_id }
      : null,
    slots: dock.slots?.map((slot) => ({
      time: slot,
      available: !(bookedMap[dock.id]?.has(slot)),
    })) ?? [],
  }));

  return { status: true, data };
}

async function getDropdownVehicles(req) {
  const { date, exclude_id } = req.query;
  if (!date) return { status: false, message: 'Parameter date wajib diisi.' };

  // Kendaraan yang sudah dipakai pada tanggal tersebut
  const usedVehicleIds = (
    await SMaterialDeliveryOrder.findAll({
      where: {
        target_date: date,
        status: { [Op.notIn]: ['draft'] },
        ...(exclude_id ? { id: { [Op.ne]: exclude_id } } : {}),
      },
      attributes: ['vehicle_id'],
    })
  ).map((r) => r.vehicle_id).filter(Boolean);

  const where = {};
  if (usedVehicleIds.length) where.id = { [Op.notIn]: usedVehicleIds };

  // Tidak ada filter status di sini — semua kendaraan yang belum terpakai
  // di hari tersebut harus muncul, tanpa memandang field status kendaraan.
  const vehicles = await SVehicles.findAll({
    where,
    include: [{ model: db.RefVehicleType, as: 'vehicle_type', attributes: ['id', 'name', 'load_capacity'] }],
    order: [['vehicle_code', 'ASC']],
  });

  return { status: true, data: vehicles };
}

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW SPLIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /preview-split?mpo_id=&vehicle_id=&exclude_mdo_id=
 *
 * Menghitung qty yang akan dimasukkan ke 1 MDO baru berdasarkan:
 *  - Sisa qty tiap part dari MPO (belum ter-cover MDO lain)
 *  - Kapasitas kendaraan (load_capacity dalam kg)
 *
 * Logika pembagian:
 *  1. Hitung total berat dari semua sisa qty: total_weight = SUM(remaining_qty × weight)
 *  2. Jika total_weight <= load_capacity → masukkan semua sisa qty (truk cukup)
 *  3. Jika total_weight > load_capacity → hitung ratio = load_capacity / total_weight
 *     lalu qty tiap part = FLOOR(remaining_qty × ratio), dengan minimum 1 jika remaining_qty > 0.
 *     (pembulatan ke bawah agar berat tidak pernah melebihi kapasitas)
 *
 * Response juga menyertakan:
 *  - suggested_qty_details[]: detail yang sudah dihitung
 *  - remaining_after[]: sisa qty di MPO setelah MDO ini dibuat
 *  - is_fully_covered: apakah MDO ini sudah menutup semua sisa MPO
 *  - total_weight_kg: total berat MDO ini
 *  - vehicle_capacity_kg: kapasitas kendaraan
 *  - capacity_usage_pct: persentase kapasitas terpakai
 *  - warnings[]: peringatan (misal part belum punya weight)
 */
async function previewSplit(req) {
  const { mpo_id, vehicle_id, exclude_mdo_id } = req.query;

  if (!mpo_id || !vehicle_id)
    return { status: false, message: 'Parameter mpo_id dan vehicle_id wajib diisi.' };

  // Ambil vehicle & kapasitasnya
  const vehicle = await SVehicles.findOne({
    where: { id: vehicle_id, status: true },
    include: [{ model: RefVehicleType, as: 'vehicle_type' }],
  });
  if (!vehicle) return { status: false, message: 'Kendaraan tidak ditemukan atau tidak aktif.' };

  const capacity = parseFloat(vehicle.vehicle_type?.load_capacity ?? 0);
  if (capacity <= 0)
    return { status: false, message: 'Kapasitas kendaraan tidak valid (load_capacity = 0).' };

  // Ambil sisa qty dari MPO
  const remainingMap = await getRemainingQtyMap(mpo_id, exclude_mdo_id ?? null);
  if (remainingMap.size === 0)
    return { status: false, message: 'MPO tidak ditemukan atau tidak memiliki detail.' };

  // Cek apakah semua sisa sudah 0 (MPO sudah fully covered)
  const hasRemaining = [...remainingMap.values()].some((v) => v.remaining_qty > 0);
  if (!hasRemaining)
    return { status: false, message: 'Semua qty pada MPO ini sudah ter-cover oleh MDO yang ada.' };

  // Hitung total berat dari sisa qty
  const warnings = [];
  let totalWeightRemaining = 0;
  for (const [, v] of remainingMap) {
    if (v.remaining_qty <= 0) continue;
    const w = parseFloat(v.part?.weight ?? 0);
    if (!v.part?.weight) warnings.push(`Part ${v.part?.part_number} belum memiliki data berat (weight). Dianggap 0 kg.`);
    totalWeightRemaining += v.remaining_qty * w;
  }

  // Hitung ratio jika melebihi kapasitas
  const ratio = totalWeightRemaining > capacity && totalWeightRemaining > 0
    ? capacity / totalWeightRemaining
    : 1;

  // Susun suggested details
  const suggestedDetails = [];
  const remainingAfter = [];
  let actualTotalWeight = 0;

  for (const [partId, v] of remainingMap) {
    if (v.remaining_qty <= 0) {
      remainingAfter.push({ part_id: partId, part: v.part, remaining_qty: 0 });
      continue;
    }

    // Floor agar berat tidak melewati kapasitas; minimal 1 jika ada sisa
    const suggestedQty = ratio < 1
      ? Math.max(1, Math.floor(v.remaining_qty * ratio))
      : v.remaining_qty;

    const weight = parseFloat(v.part?.weight ?? 0);
    actualTotalWeight += suggestedQty * weight;

    suggestedDetails.push({
      part_id: partId,
      part: v.part,
      ordered_qty: v.ordered_qty,
      covered_qty: v.covered_qty,
      remaining_qty: v.remaining_qty,
      suggested_qty: suggestedQty,
      weight_per_unit_kg: weight,
      subtotal_weight_kg: suggestedQty * weight,
    });

    remainingAfter.push({
      part_id: partId,
      part: v.part,
      remaining_qty: Math.max(0, v.remaining_qty - suggestedQty),
    });
  }

  const isFullyCovered = remainingAfter.every((r) => r.remaining_qty === 0);

  return {
    status: true,
    data: {
      vehicle: {
        id: vehicle.id,
        vehicle_code: vehicle.vehicle_code,
        plate_number: vehicle.plate_number,
        vehicle_type: vehicle.vehicle_type?.name,
        capacity_kg: capacity,
      },
      suggested_qty_details: suggestedDetails,
      remaining_after: remainingAfter,
      is_fully_covered: isFullyCovered,
      total_weight_kg: parseFloat(actualTotalWeight.toFixed(3)),
      vehicle_capacity_kg: capacity,
      capacity_usage_pct: capacity > 0
        ? parseFloat(((actualTotalWeight / capacity) * 100).toFixed(2))
        : 0,
      warnings,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

async function list(req) {
  const { page = 1, limit = 10, status, search, mpo_id } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const where = {};
  if (status) where.status = status;
  if (search) where.number = { [Op.like]: `%${search}%` };
  if (mpo_id) where.mpo_id = mpo_id;

  const { count, rows } = await SMaterialDeliveryOrder.findAndCountAll({
    where,
    include: [
      { model: SMaterialPurchaseOrder, as: 'mpo', attributes: ['id', 'number', 'description'] },
      { model: SDocks, as: 'dock', attributes: ['id', 'name'] },
      {
        model: SVehicles,
        as: 'vehicle',
        attributes: ['id', 'vehicle_code', 'plate_number'],
        include: [{ model: RefVehicleType, as: 'vehicle_type', attributes: ['name', 'load_capacity'] }],
      },
    ],
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset,
  });

  return {
    status: true,
    data: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(count / parseInt(limit)),
      rows,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL
// ─────────────────────────────────────────────────────────────────────────────

async function detail(req) {
  const { id } = req.params;
  const row = await SMaterialDeliveryOrder.findByPk(id, {
    include: [
      {
        model: SMaterialPurchaseOrder,
        as: 'mpo',
        attributes: ['id', 'number', 'description', 'status'],
      },
      { model: SDocks, as: 'dock' },
      {
        model: SVehicles,
        as: 'vehicle',
        include: [{ model: RefVehicleType, as: 'vehicle_type' }],
      },
      {
        model: TMaterialDeliveryOrderDetail,
        as: 'mdo_details',
        include: [{ model: SParts, as: 'part', include: [{ model: SUom, as: 'uom' }] }],
      },
    ],
  });

  if (!row) return { status: false, message: 'MDO tidak ditemukan.' };

  // Sertakan info berat total
  const { total_weight_kg, has_missing_weight, missing_weight_parts } = calcTotalWeight(
    (row.mdo_details ?? []).map((d) => ({ qty: d.qty, part: d.part, part_id: d.part_id }))
  );

  return {
    status: true,
    data: {
      ...row.toJSON(),
      total_weight_kg,
      vehicle_capacity_kg: parseFloat(row.vehicle?.vehicle_type?.load_capacity ?? 0),
      capacity_usage_pct: row.vehicle?.vehicle_type?.load_capacity
        ? parseFloat(((total_weight_kg / row.vehicle.vehicle_type.load_capacity) * 100).toFixed(2))
        : null,
      warnings: has_missing_weight
        ? [`Part berikut belum memiliki data berat: ${missing_weight_parts.join(', ')}`]
        : [],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /
 * Body:
 * {
 *   mpo_id, dock_id, target_date, target_time,
 *   vehicle_id, transporter, description, remarks,
 *   save_as,          // 'draft' | 'scheduled'
 *   details: [{ part_id, qty, notes }]
 * }
 *
 * Validasi:
 * 1. MPO harus berstatus 'approved'
 * 2. Vehicle tersedia (tidak dipakai MDO lain pada target_date, status non-draft)
 * 3. Setiap detail: qty tidak boleh melebihi remaining_qty dari MPO
 * 4. Total berat tidak boleh melebihi load_capacity vehicle
 */
async function create(req) {
  const {
    mpo_id, dock_id, target_date, target_time,
    vehicle_id, transporter, description, remarks,
    save_as = 'draft',
    details = [],
  } = req.body;

  // ── Validasi input dasar ──────────────────────────────────────────────────
  if (!mpo_id) return { status: false, message: 'mpo_id wajib diisi.' };
  if (!target_date) return { status: false, message: 'target_date wajib diisi.' };
  if (!details.length) return { status: false, message: 'Detail MDO tidak boleh kosong.' };

  // ── Validasi MPO ──────────────────────────────────────────────────────────
  const mpo = await SMaterialPurchaseOrder.findOne({ where: { id: mpo_id, status: 'approved' } });
  if (!mpo) return { status: false, message: 'MPO tidak ditemukan atau belum berstatus approved.' };

  // ── Validasi vehicle ──────────────────────────────────────────────────────
  if (vehicle_id) {
    const conflict = await SMaterialDeliveryOrder.findOne({
      where: {
        vehicle_id,
        target_date,
        status: { [Op.notIn]: ['draft'] },
      },
    });
    if (conflict)
      return { status: false, message: `Kendaraan sudah digunakan oleh MDO ${conflict.number} pada tanggal tersebut.` };
  }

  // ── Validasi konflik dock ────────────────────────────────────────────────
  if (dock_id && target_date && target_time) {
    const dockConflict = await SMaterialDeliveryOrder.findOne({
      where: {
        dock_id,
        target_date,
        target_time,
        status: { [Op.notIn]: ['draft'] },
      },
    });
    if (dockConflict)
      return {
        status: false,
        message: `Dock sudah dibooking oleh MDO ${dockConflict.number} pada tanggal dan waktu yang sama.`,
      };
  }

  // ── Ambil vehicle untuk validasi kapasitas ────────────────────────────────
  let capacity = Infinity;
  if (vehicle_id) {
    const vehicle = await SVehicles.findOne({
      where: { id: vehicle_id },
      include: [{ model: RefVehicleType, as: 'vehicle_type' }],
    });
    if (!vehicle) return { status: false, message: 'Kendaraan tidak ditemukan.' };
    capacity = parseFloat(vehicle.vehicle_type?.load_capacity ?? Infinity);
  }

  // ── Validasi remaining qty & berat ───────────────────────────────────────
  const remainingMap = await getRemainingQtyMap(mpo_id);
  let totalWeight = 0;
  const errors = [];

  for (const d of details) {
    const rem = remainingMap.get(d.part_id);
    if (!rem) {
      errors.push(`Part ID ${d.part_id} tidak ada dalam detail MPO.`);
      continue;
    }
    if (parseFloat(d.qty) > rem.remaining_qty) {
      errors.push(
        `Part ${rem.part?.part_name} (ID ${d.part_id}): qty ${d.qty} melebihi sisa yang tersedia (${rem.remaining_qty}).`
      );
    }
    totalWeight += parseFloat(d.qty) * parseFloat(rem.part?.weight ?? 0);
  }

  if (errors.length) return { status: false, message: errors.join(' | ') };

  if (totalWeight > capacity)
    return {
      status: false,
      message: `Total berat muatan (${totalWeight.toFixed(2)} kg) melebihi kapasitas kendaraan (${capacity} kg). Kurangi qty atau gunakan kendaraan lain.`,
    };

  // ── Simpan ke DB (transaction) ────────────────────────────────────────────
  const t = await sequelize.transaction();
  try {
    const number = await generateMdoNumber(target_date);
    const status = save_as === 'scheduled' ? 'scheduled' : 'draft';

    const mdo = await SMaterialDeliveryOrder.create(
      {
        mpo_id,
        dock_id: dock_id ?? null,
        vehicle_id: vehicle_id ?? null,
        number,
        description,
        target_date,
        target_time: target_time ?? null,
        transporter,
        status,
        remarks,
        created_by: req.session?.user?.id ?? null,
      },
      { transaction: t }
    );

    await TMaterialDeliveryOrderDetail.bulkCreate(
      details.map((d) => ({
        mdo_id: mdo.id,
        part_id: d.part_id,
        qty: d.qty,
        notes: d.notes ?? null,
      })),
      { transaction: t }
    );

    await t.commit();
    return { status: true, message: 'MDO berhasil dibuat.', data: { id: mdo.id, number: mdo.number, status } };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

async function update(req) {
  const { id } = req.params;
  const {
    dock_id, target_date, target_time,
    vehicle_id, transporter, description, remarks,
    save_as,
    details = [],
  } = req.body;

  const mdo = await SMaterialDeliveryOrder.findByPk(id);
  if (!mdo) return { status: false, message: 'MDO tidak ditemukan.' };
  if (mdo.status !== 'draft') return { status: false, message: 'Hanya MDO berstatus draft yang bisa diedit.' };

  const finalDate = target_date ?? mdo.target_date;
  const finalVehicleId = vehicle_id ?? mdo.vehicle_id;

  // Validasi konflik vehicle (kecuali MDO ini sendiri)
  if (finalVehicleId) {
    const conflict = await SMaterialDeliveryOrder.findOne({
      where: {
        vehicle_id: finalVehicleId,
        target_date: finalDate,
        status: { [Op.notIn]: ['draft'] },
        id: { [Op.ne]: id },
      },
    });
    if (conflict)
      return { status: false, message: `Kendaraan sudah digunakan oleh MDO ${conflict.number} pada tanggal tersebut.` };
  }

  // Validasi konflik dock (kecuali MDO ini sendiri)
  const finalDockId = dock_id ?? mdo.dock_id;
  const finalTime = target_time ?? mdo.target_time;
  if (finalDockId && finalDate && finalTime) {
    const dockConflict = await SMaterialDeliveryOrder.findOne({
      where: {
        dock_id: finalDockId,
        target_date: finalDate,
        target_time: finalTime,
        status: { [Op.notIn]: ['draft'] },
        id: { [Op.ne]: id },
      },
    });
    if (dockConflict)
      return {
        status: false,
        message: `Dock sudah dibooking oleh MDO ${dockConflict.number} pada tanggal dan waktu yang sama.`,
      };
  }

  // Validasi kapasitas
  let capacity = Infinity;
  if (finalVehicleId) {
    const vehicle = await SVehicles.findOne({
      where: { id: finalVehicleId },
      include: [{ model: RefVehicleType, as: 'vehicle_type' }],
    });
    if (!vehicle) return { status: false, message: 'Kendaraan tidak ditemukan.' };
    capacity = parseFloat(vehicle.vehicle_type?.load_capacity ?? Infinity);
  }

  // Validasi remaining qty (exclude MDO ini sendiri agar tidak menghitung dirinya)
  const remainingMap = await getRemainingQtyMap(mdo.mpo_id, id);
  let totalWeight = 0;
  const errors = [];

  for (const d of details) {
    const rem = remainingMap.get(d.part_id);
    if (!rem) { errors.push(`Part ID ${d.part_id} tidak ada dalam detail MPO.`); continue; }
    if (parseFloat(d.qty) > rem.remaining_qty) {
      errors.push(`Part ${rem.part?.part_name}: qty ${d.qty} melebihi sisa (${rem.remaining_qty}).`);
    }
    totalWeight += parseFloat(d.qty) * parseFloat(rem.part?.weight ?? 0);
  }

  if (errors.length) return { status: false, message: errors.join(' | ') };
  if (totalWeight > capacity)
    return {
      status: false,
      message: `Total berat (${totalWeight.toFixed(2)} kg) melebihi kapasitas kendaraan (${capacity} kg).`,
    };

  const t = await sequelize.transaction();
  try {
    const newStatus = save_as === 'scheduled' ? 'scheduled' : mdo.status;

    await mdo.update(
      {
        dock_id: dock_id ?? mdo.dock_id,
        vehicle_id: finalVehicleId,
        target_date: finalDate,
        target_time: target_time ?? mdo.target_time,
        transporter: transporter ?? mdo.transporter,
        description: description ?? mdo.description,
        remarks: remarks ?? mdo.remarks,
        status: newStatus,
      },
      { transaction: t }
    );

    if (details.length) {
      // Hapus detail lama lalu insert baru (soft-delete)
      await TMaterialDeliveryOrderDetail.destroy({ where: { mdo_id: id }, transaction: t });
      await TMaterialDeliveryOrderDetail.bulkCreate(
        details.map((d) => ({ mdo_id: id, part_id: d.part_id, qty: d.qty, notes: d.notes ?? null })),
        { transaction: t }
      );
    }

    await t.commit();
    return { status: true, message: 'MDO berhasil diperbarui.', data: { id, status: newStatus } };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

async function deleteMdo(req) {
  const { id } = req.params;
  const mdo = await SMaterialDeliveryOrder.findByPk(id);
  if (!mdo) return { status: false, message: 'MDO tidak ditemukan.' };
  if (mdo.status !== 'draft') return { status: false, message: 'Hanya MDO berstatus draft yang bisa dihapus.' };

  await mdo.destroy(); // soft-delete (paranoid: true)
  return { status: true, message: 'MDO berhasil dihapus.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE STATUS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_FLOW = { scheduled: 'in_transit', in_transit: 'arrived' };

async function updateStatus(req) {
  const { id } = req.params;
  const mdo = await SMaterialDeliveryOrder.findByPk(id);
  if (!mdo) return { status: false, message: 'MDO tidak ditemukan.' };

  const next = STATUS_FLOW[mdo.status];
  if (!next)
    return { status: false, message: `Status '${mdo.status}' tidak dapat dimajukan melalui endpoint ini.` };

  await mdo.update({ status: next });
  return { status: true, message: `Status MDO berhasil diubah ke '${next}'.`, data: { id, status: next } };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export default {
  getDropdownStatuses,
  getDropdownMpo,
  getDropdownWarehouses,
  getDropdownDocks,
  getDropdownVehicles,
  previewSplit,
  list,
  detail,
  create,
  update,
  delete: deleteMdo,
  updateStatus,
};