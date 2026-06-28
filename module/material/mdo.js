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
  TMaterialReceiving,
  TGoodReceipt,
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
// AUDIT WEIGHT INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * auditWeightIntegrity
 *
 * Mendeteksi part_id yang memiliki weight = NULL atau <= 0
 * dalam konteks sebuah transaksi (MDO yang sudah ada, MPO, atau detail mentah).
 *
 * Bisa dipanggil:
 *  1. Sebelum create/update MDO, untuk warning di response.
 *  2. Sebagai endpoint audit mandiri: GET /audit-weight?mdo_id=X atau ?mpo_id=X
 *
 * @param {object} options
 * @param {number} [options.mdo_id]   - Audit berdasarkan MDO yang sudah ada
 * @param {number} [options.mpo_id]   - Audit berdasarkan detail MPO
 * @param {Array}  [options.details]  - Audit dari array detail mentah: [{ part_id, qty }]
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   missing_weight: Array<{ part_id, part_number, part_name, weight, qty }>,
 *   warnings: string[]
 * }>}
 */
async function auditWeightIntegrity({ mdo_id, mpo_id, details: rawDetails } = {}) {
  let partIds = [];
  const qtyMap = {}; // part_id → qty (untuk konteks)

  // ── Sumber 1: dari MDO yang sudah tersimpan ──────────────────────────────
  if (mdo_id) {
    const mdoDetails = await TMaterialDeliveryOrderDetail.findAll({
      where: { mdo_id },
      attributes: ['part_id', 'qty'],
    });
    for (const d of mdoDetails) {
      partIds.push(d.part_id);
      qtyMap[d.part_id] = parseFloat(d.qty);
    }
  }

  // ── Sumber 2: dari semua detail MPO ─────────────────────────────────────
  else if (mpo_id) {
    const mpoDetails = await TMaterialPurchaseOrderDetail.findAll({
      where: { mpo_id },
      attributes: ['part_id', 'qty'],
    });
    for (const d of mpoDetails) {
      partIds.push(d.part_id);
      qtyMap[d.part_id] = parseFloat(d.qty);
    }
  }

  // ── Sumber 3: dari array detail mentah (sebelum persist) ────────────────
  else if (rawDetails && rawDetails.length > 0) {
    for (const d of rawDetails) {
      partIds.push(d.part_id);
      qtyMap[d.part_id] = parseFloat(d.qty);
    }
  }

  if (partIds.length === 0) {
    return { ok: true, missing_weight: [], warnings: [] };
  }

  // De-duplikasi
  partIds = [...new Set(partIds)];

  // Ambil data SParts untuk semua part_id
  const parts = await SParts.findAll({
    where: { id: partIds },
    attributes: ['id', 'part_number', 'part_name', 'weight'],
  });

  const missing = [];
  const warnings = [];

  for (const p of parts) {
    const w = p.weight !== null ? parseFloat(p.weight) : null;
    const isMissing = w === null || w <= 0;

    if (isMissing) {
      missing.push({
        part_id: p.id,
        part_number: p.part_number,
        part_name: p.part_name,
        weight: p.weight,
        qty: qtyMap[p.id] ?? null,
      });
      warnings.push(
        `Part ${p.part_number} (${p.part_name}) belum memiliki data berat yang valid` +
        (p.weight === null ? ' (weight = NULL).' : ` (weight = ${p.weight} ≤ 0).`) +
        ' Harap isi di master data Parts.'
      );
    }
  }

  return {
    ok: missing.length === 0,
    missing_weight: missing,
    warnings,
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
    // Syarat ke-4: Jika user sedang edit MDO yang terikat ke mpo_id tertentu,
    // pastikan MPO itu selalu muncul di dropdown meski sudah tidak ada sisa.
    const isCurrentlyEdited = mpo_id && String(r.id) === String(mpo_id);

    const remainingMap = await getRemainingQtyMap(r.id);

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

    // ── 4. Filter ketat: HANYA tampilkan MPO yang masih memiliki remaining_qty > 0
    //    pada setidaknya 1 part. Pengecualian: MPO yang sedang diedit user
    //    (via query param mpo_id) tetap ditampilkan agar tidak hilang dari dropdown.
    if (details.length === 0 && !isCurrentlyEdited) continue; // ← MPO sudah habis, skip

    result.push({
      id: r.id,
      number: r.number,
      description: r.description,
      supplier_name: r.supplier?.name ?? null,
      details, // ← Syarat ke-3: `details` WAJIB di dalam object MPO
    });
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
 * Generate array waktu statis dari jam 06:00 s/d 18:00 dengan interval 30 menit.
 * Contoh output: ['06:00', '06:30', '07:00', ..., '18:00']
 */
function generateStaticTimeSlots() {
  const slots = [];
  for (let h = 6; h <= 18; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 18) slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

/**
 * Ambil daftar loading dock yang:
 * 1. Berada di area milik Main Material Warehouse (warehouse_id: 1)
 * 2. Setiap dock dilengkapi `slots` array berisi waktu 06:00–18:00 (interval 30 menit)
 *    dengan flag `available: false` jika slot tersebut sudah dibooking pada tanggal yang dipilih.
 *
 * PERUBAHAN v3:
 * - Tidak lagi mengandalkan `dock.slots` dari DB (yang bisa kosong/undefined).
 * - Menggunakan `generateStaticTimeSlots()` untuk generate array waktu secara konsisten.
 * - `bookedMap[dock_id]` berisi Set berisi string waktu yang sudah terpakai (non-draft, non-cancelled, non-rejected).
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

  // ── 2. Dock yang sudah dibooking pada tanggal tersebut ───────────────────
  //    Status cancelled dan rejected tidak dianggap booked.
  //    Draft JUGA mengunci slot (aturan bisnis v3).
  const bookedRecords = await SMaterialDeliveryOrder.findAll({
    where: {
      target_date: date,
      // FIX: 'arrived' dikeluarkan dari daftar status yang mengunci slot.
      // Begitu MDO sampai (arrived), dock dianggap sudah kosong/selesai dipakai.
      status: { [Op.notIn]: ['cancelled', 'rejected', 'arrived'] },
      dock_id: { [Op.ne]: null },
      target_time: { [Op.ne]: null },
      ...(exclude_id ? { id: { [Op.ne]: exclude_id } } : {}),
    },
    attributes: ['dock_id', 'target_time'],
  });

  // bookedMap[dock_id] → Set<string> berisi target_time yang sudah terpakai
  const bookedMap = {};
  for (const m of bookedRecords) {
    if (!bookedMap[m.dock_id]) bookedMap[m.dock_id] = new Set();
    // Normalisasi: simpan hanya HH:mm (5 karakter) agar konsisten dengan slot string
    const normalizedTime = m.target_time ? String(m.target_time).substring(0, 5) : null;
    if (normalizedTime) bookedMap[m.dock_id].add(normalizedTime);
  }

  // ── 3. Ambil dock khusus dari area Raw Materials warehouse ──────────────────
  //    Filter berantai dengan required: true di setiap level agar Sequelize
  //    benar-benar membuang (INNER JOIN) baris yang tidak cocok kategori.
  const docks = await SDocks.findAll({
    where: { area_id: { [Op.in]: materialAreaIds } },
    include: [
      {
        model: SWarehouseAreas,
        as: 'area',
        required: true,
        attributes: ['id', 'name', 'warehouse_id'],
        include: [
          {
            model: SWarehouses,
            as: 'warehouse',
            required: true,
            attributes: ['id', 'name'],
            include: [
              {
                model: db.RefWarehouseCategories,
                as: 'category',
                required: true,
                where: { name: 'Raw Materials' },
                attributes: ['id', 'name'],
              },
            ],
          },
        ],
      },
    ],
    order: [['name', 'ASC']],
  });

  // ── 4. Generate slot statis dan tandai availability ──────────────────────
  const staticSlots = generateStaticTimeSlots();

  const data = docks.map((dock) => ({
    id: dock.id,
    name: dock.name,
    area: dock.area
      ? { id: dock.area.id, name: dock.area.name, warehouse_id: dock.area.warehouse_id }
      : null,
    slots: staticSlots.map((time) => ({
      time,
      available: !(bookedMap[dock.id]?.has(time)),
    })),
  }));

  return { status: true, data };
}

async function getDropdownVehicles(req) {
  const { date, exclude_id } = req.query;
  if (!date) return { status: false, message: 'Parameter date wajib diisi.' };

  // Kendaraan yang sudah dipakai pada tanggal tersebut.
  // Draft JUGA mengunci kendaraan (aturan bisnis v3).
  const usedVehicleIds = (
    await SMaterialDeliveryOrder.findAll({
      where: {
        target_date: date,
        // FIX: 'arrived' dikeluarkan — kendaraan yang sudah sampai dianggap
        // selesai tugas pada MDO ini dan boleh dipakai MDO lain di hari yang sama.
        status: { [Op.notIn]: ['cancelled', 'rejected', 'arrived'] },
        ...(exclude_id ? { id: { [Op.ne]: exclude_id } } : {}),
      },
      attributes: ['vehicle_id'],
    })
  ).map((r) => r.vehicle_id).filter(Boolean);

  // Filter wajib:
  //  • status: true               → kendaraan aktif (tidak dinonaktifkan di master)
  //  • availability_status: 'Available' → tidak sedang rusak / keluar / dipakai pihak lain
  //  • id NOT IN usedVehicleIds   → belum dijadwalkan MDO lain di hari yang sama
  const where = {
    status: true,
    availability_status: 'Available',
  };
  if (usedVehicleIds.length) where.id = { [Op.notIn]: usedVehicleIds };

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
 * previewSplit — bisa dipanggil via GET maupun POST.
 *
 * Mode A — GET /preview-split?mpo_id=&vehicle_id= (tanpa body details)
 *   Menghitung qty yang disarankan berdasarkan sisa qty MPO × kapasitas kendaraan.
 *   Dipakai saat pertama kali vehicle dipilih sebelum user menyentuh detail.
 *
 * Mode B — POST /preview-split (dengan body { mpo_id, vehicle_id, details[] })
 *   Frontend mengirim details = [{ part_id, qty }] yang mencerminkan kondisi
 *   form saat ini (item yang diceklis + qty yang diubah user).
 *   Backend MEMPRIORITASKAN array ini untuk menghitung total berat aktual,
 *   sehingga indikator kapasitas langsung bereaksi saat user mengubah Qty.
 *
 * Response menyertakan:
 *  - total_weight_kg        : total berat berdasarkan details aktual (Mode B)
 *                             atau suggested (Mode A)
 *  - vehicle_capacity_kg    : kapasitas kendaraan
 *  - capacity_usage_pct     : persentase kapasitas terpakai
 *  - has_null_weight        : true jika ada part dengan weight null/0
 *  - suggested_qty_details[]
 *  - remaining_after[]
 *  - is_fully_covered
 *  - warnings[]
 */
async function previewSplit(req) {
  const mpo_id         = req.body?.mpo_id         ?? req.query?.mpo_id;
  const vehicle_id     = req.body?.vehicle_id     ?? req.query?.vehicle_id;
  const exclude_mdo_id = req.body?.exclude_mdo_id ?? req.query?.exclude_mdo_id ?? null;

  let frontendDetails = null;

  if (Array.isArray(req.body?.details) && req.body.details.length > 0) {
    frontendDetails = req.body.details.map((item) => ({
      part_id: String(item.part_id),
      qty: Number(item.qty) || 0,
    }));
  } else if (req.query?.details) {
    try {
      const parsed = JSON.parse(req.query.details);
      if (Array.isArray(parsed) && parsed.length > 0) {
        frontendDetails = parsed.map((item) => ({
          part_id: String(item.part_id),
          qty: Number(item.qty) || 0,
        }));
      }
    } catch (err) {
      console.error('previewSplit: Gagal parse query param details:', err);
    }
  }

  if (!mpo_id || !vehicle_id)
    return { status: false, message: 'Parameter mpo_id dan vehicle_id wajib diisi.' };

  const vehicle = await SVehicles.findOne({
    where: { id: vehicle_id, status: true },
    include: [{ model: RefVehicleType, as: 'vehicle_type' }],
  });
  if (!vehicle) return { status: false, message: 'Kendaraan tidak ditemukan atau tidak aktif.' };

  const capacity = parseFloat(vehicle.vehicle_type?.load_capacity ?? 0);
  if (capacity <= 0)
    return { status: false, message: 'Kapasitas kendaraan tidak valid (load_capacity = 0).' };

  const remainingMap = await getRemainingQtyMap(mpo_id, exclude_mdo_id);
  if (remainingMap.size === 0)
    return { status: false, message: 'MPO tidak ditemukan atau tidak memiliki detail.' };

  const hasRemaining = [...remainingMap.values()].some((v) => v.remaining_qty > 0);
  if (!hasRemaining)
    return { status: false, message: 'Semua qty pada MPO ini sudah ter-cover oleh MDO yang ada.' };

  const warnings = [];
  let hasNullWeight = false;

  // ══════════════════════════════════════════════════════════════════════════
  // MODE B: Frontend mengirim details — hitung berat berdasarkan qty form
  // ══════════════════════════════════════════════════════════════════════════
  if (frontendDetails) {
    const liveDetailsMap = {};
    frontendDetails.forEach((item) => {
      liveDetailsMap[String(item.part_id)] = Number(item.qty) || 0;
    });

    const allPartIds = [...remainingMap.keys()];
    const parts = await SParts.findAll({
      where: { id: allPartIds },
      attributes: ['id', 'part_number', 'part_name', 'weight'],
    });
    const partMap = new Map(parts.map((p) => [p.id, p]));

    let actualTotalWeight = 0;
    const suggestedDetails = [];

    for (const [partId, rem] of remainingMap) {
      const part = partMap.get(partId) ?? rem.part;
      const weight = parseFloat(part?.weight ?? 0);
      const weightMissing = !part?.weight || parseFloat(part.weight) <= 0;

      let calculate_qty;
      const partIdStr = String(partId);
      if (liveDetailsMap[partIdStr] !== undefined) {
        calculate_qty = liveDetailsMap[partIdStr];
      } else {
        calculate_qty = 0;
      }

      if (weightMissing && calculate_qty > 0) {
        hasNullWeight = true;
        warnings.push(
          `Part ${part?.part_number ?? partId} belum memiliki data berat (weight). Dianggap 0 kg.`
        );
      }

      const subtotal = calculate_qty * weight;
      actualTotalWeight += subtotal;

      if (calculate_qty > 0) {
        suggestedDetails.push({
          part_id: partId,
          part,
          ordered_qty:        rem.ordered_qty  ?? null,
          covered_qty:        rem.covered_qty  ?? null,
          remaining_qty:      rem.remaining_qty ?? null,
          suggested_qty:      calculate_qty,
          weight_per_unit_kg: weight,
          subtotal_weight_kg: parseFloat(subtotal.toFixed(3)),
        });
      }
    }

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
        remaining_after: [],          // tidak relevan di mode live-preview
        is_fully_covered: false,      // tidak relevan di mode live-preview
        total_weight_kg: parseFloat(actualTotalWeight.toFixed(3)),
        vehicle_capacity_kg: capacity,
        capacity_usage_pct: capacity > 0
          ? parseFloat(((actualTotalWeight / capacity) * 100).toFixed(2))
          : 0,
        has_null_weight: hasNullWeight,
        warnings,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODE A: Tidak ada frontend details — hitung berdasarkan sisa qty MPO
  // ══════════════════════════════════════════════════════════════════════════

  // Hitung total berat dari sisa qty
  let totalWeightRemaining = 0;
  for (const [, v] of remainingMap) {
    if (v.remaining_qty <= 0) continue;
    const w = parseFloat(v.part?.weight ?? 0);
    const weightMissing = !v.part?.weight || parseFloat(v.part.weight) <= 0;
    if (weightMissing) {
      hasNullWeight = true;
      warnings.push(`Part ${v.part?.part_number} belum memiliki data berat (weight). Dianggap 0 kg.`);
    }
    totalWeightRemaining += v.remaining_qty * w;
  }

  // Hitung ratio jika melebihi kapasitas
  const ratio = totalWeightRemaining > capacity && totalWeightRemaining > 0
    ? capacity / totalWeightRemaining
    : 1;

  const suggestedDetails = [];
  const remainingAfter = [];
  let actualTotalWeight = 0;

  for (const [partId, v] of remainingMap) {
    if (v.remaining_qty <= 0) {
      remainingAfter.push({ part_id: partId, part: v.part, remaining_qty: 0 });
      continue;
    }

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
      has_null_weight: hasNullWeight,
      warnings,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

async function list(req) {
  const { page = 1, limit = 10, status, search, mpo_id, include_completed } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const where = {};
  if (status) where.status = status;
  if (search) where.number = { [Op.like]: `%${search}%` };
  if (mpo_id) where.mpo_id = mpo_id;

  // ── FIX: sembunyikan MDO yang sudah selesai siklusnya (Good Receipt) ────────
  // "Selesai" didefinisikan oleh keberadaan record TGoodReceipt, BUKAN oleh
  // status_id di TMaterialReceiving — karena TGoodReceipt adalah tabel approval
  // final yang terpisah (lihat asosiasi: SMaterialDeliveryOrder hasOne
  // TMaterialReceiving hasOne TGoodReceipt). Status MDO sendiri tetap mentok
  // di 'arrived'; data tidak dihapus (soft-delete), hanya disembunyikan dari
  // list default agar halaman tidak penuh. Kirim ?include_completed=true
  // untuk menampilkan kembali (misal kebutuhan riwayat/laporan).
  if (!include_completed || include_completed === 'false') {
    const completedMdoIds = (
      await TMaterialReceiving.findAll({
        attributes: ['mdo_id'],
        include: [
          {
            model: TGoodReceipt,
            as: 'good_receipt',
            required: true, // INNER JOIN → hanya receiving yang sudah ada Good Receipt-nya
            attributes: [],
          },
        ],
        raw: true,
      })
    ).map((r) => r.mdo_id);

    if (completedMdoIds.length) {
      where.id = { [Op.notIn]: completedMdoIds };
    }
  }

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
      // ── TAMBAHAN: sertakan detail MDO beserta berat part ─────────────────────
      {
        model: TMaterialDeliveryOrderDetail,
        as: 'mdo_details',
        attributes: ['id', 'part_id', 'qty'],
        include: [
          {
            model: SParts,
            as: 'part',
            attributes: ['id', 'weight'],
          },
        ],
      },
    ],
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset,
    distinct: true, // hindari count ganda akibat JOIN ke detail
  });

  // ── Injeksi properti kapasitas ke masing-masing baris (sama seperti detail()) ─
  const enrichedRows = rows.map((row) => {
    const details = (row.mdo_details ?? []).map((d) => ({
      qty: d.qty,
      part: d.part,
      part_id: d.part_id,
    }));

    const { total_weight_kg, has_missing_weight, missing_weight_parts } = calcTotalWeight(details);
    const capacity = parseFloat(row.vehicle?.vehicle_type?.load_capacity ?? 0);

    return {
      ...row.toJSON(),
      total_weight_kg,
      vehicle_capacity_kg: capacity || null,
      capacity_usage_pct: capacity > 0
        ? parseFloat(((total_weight_kg / capacity) * 100).toFixed(2))
        : null,
      warnings: has_missing_weight
        ? [`Part berikut belum memiliki data berat: ${missing_weight_parts.join(', ')}`]
        : [],
    };
  });

  return {
    status: true,
    data: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(count / parseInt(limit)),
      rows: enrichedRows,
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

  if (!mpo_id) return { status: false, message: 'mpo_id wajib diisi.' };
  if (!target_date) return { status: false, message: 'target_date wajib diisi.' };
  if (!details.length) return { status: false, message: 'Detail MDO tidak boleh kosong.' };

  const mpo = await SMaterialPurchaseOrder.findOne({ where: { id: mpo_id, status: 'approved' } });
  if (!mpo) return { status: false, message: 'MPO tidak ditemukan atau belum berstatus approved.' };

  if (vehicle_id) {
    const vehicleConflict = await SMaterialDeliveryOrder.findOne({
      where: {
        vehicle_id,
        target_date,
        // FIX: 'arrived' dikeluarkan — kendaraan yang sudah sampai (selesai
        // tugas untuk MDO ini) tidak boleh dianggap masih "dibooking".
        status: { [Op.notIn]: ['cancelled', 'rejected', 'arrived'] },
      },
    });
    if (vehicleConflict)
      return {
        status: false,
        message: `Double-booking! Kendaraan sudah dijadwalkan pada MDO ${vehicleConflict.number} di tanggal dan waktu yang sama. Pilih kendaraan lain atau ubah jadwal.`,
      };
  }

  if (dock_id && target_date && target_time) {
    const dockConflict = await SMaterialDeliveryOrder.findOne({
      where: {
        dock_id,
        target_date,
        target_time,
        // FIX: 'arrived' dikeluarkan — dock dianggap kosong begitu MDO sampai.
        status: { [Op.notIn]: ['cancelled', 'rejected', 'arrived'] },
      },
    });
    if (dockConflict)
      return {
        status: false,
        message: `Double-booking! Dock sudah dibooking oleh MDO ${dockConflict.number} pada tanggal dan slot waktu yang sama. Pilih dock lain atau ubah slot waktu.`,
      };
  }

  let capacity = Infinity;
  if (vehicle_id) {
    const vehicle = await SVehicles.findOne({
      where: { id: vehicle_id },
      include: [{ model: RefVehicleType, as: 'vehicle_type' }],
    });
    if (!vehicle) return { status: false, message: 'Kendaraan tidak ditemukan.' };
    capacity = parseFloat(vehicle.vehicle_type?.load_capacity ?? Infinity);
  }

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
      httpCode: 400,
      message: `Total muatan melebihi kapasitas maksimal kendaraan! (${totalWeight.toFixed(2)} kg > ${capacity} kg). Kurangi qty atau pilih kendaraan lain.`,
    };

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

  // Validasi double-booking vehicle (kecuali MDO ini sendiri)
  // Draft JUGA memblokir (aturan bisnis v3).
  if (finalVehicleId) {
    const conflict = await SMaterialDeliveryOrder.findOne({
      where: {
        vehicle_id: finalVehicleId,
        target_date: finalDate,
        // FIX: 'arrived' dikeluarkan — kendaraan yang sudah sampai (selesai
        // tugas untuk MDO ini) tidak boleh dianggap masih "dibooking".
        status: { [Op.notIn]: ['cancelled', 'rejected', 'arrived'] },
        id: { [Op.ne]: id },
      },
    });
    if (conflict)
      return {
        status: false,
        message: `Double-booking! Kendaraan sudah dijadwalkan pada MDO ${conflict.number} di tanggal yang sama. Pilih kendaraan lain atau ubah jadwal.`,
      };
  }

  // Validasi double-booking dock + slot waktu (kecuali MDO ini sendiri)
  // Draft JUGA memblokir slot dock (aturan bisnis v3).
  const finalDockId = dock_id ?? mdo.dock_id;
  const finalTime = target_time ?? mdo.target_time;
  if (finalDockId && finalDate && finalTime) {
    const dockConflict = await SMaterialDeliveryOrder.findOne({
      where: {
        dock_id: finalDockId,
        target_date: finalDate,
        target_time: finalTime,
        // FIX: 'arrived' dikeluarkan — dock dianggap kosong begitu MDO sampai.
        status: { [Op.notIn]: ['cancelled', 'rejected', 'arrived'] },
        id: { [Op.ne]: id },
      },
    });
    if (dockConflict)
      return {
        status: false,
        message: `Double-booking! Dock sudah dibooking oleh MDO ${dockConflict.number} pada tanggal dan slot waktu yang sama. Pilih dock lain atau ubah slot waktu.`,
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
      httpCode: 400,
      message: `Total muatan melebihi kapasitas maksimal kendaraan! (${totalWeight.toFixed(2)} kg > ${capacity} kg). Kurangi qty atau pilih kendaraan lain.`,
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
  auditWeightIntegrity,
};