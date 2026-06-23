import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';

const {
  SMrp,
  SMrpDetail,
  SSalesPurchaseRequests,
  SSalesPurchaseRequestDetails,
  SProductionPlan,
  SProductionPlanDetail,
  SBoms,
  SBomDetails,
  SParts,
  SUsers,
  SUserDetail,
  SUom,
  sequelize,
} = db;

// ============================================================
// STATUS CONSTANTS
// Alur: Draft → Submitted → Approved / Rejected
// ============================================================
const MRP_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const PRIORITY_VALUES = ['High', 'Medium', 'Low'];

// ============================================================
// REUSABLE INCLUDES
// ============================================================
const includeCreator = {
  model: SUsers,
  as: 'creator',
  attributes: ['id', 'email'],
  include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name', 'employee_number'] }],
};

const includeApprover = {
  model: SUsers,
  as: 'approver',
  attributes: ['id', 'email'],
  include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name', 'employee_number'] }],
};

const includeSalesPlan = {
  model: SSalesPurchaseRequests,
  as: 'sales_plan',
  attributes: ['id', 'spr_number', 'spr_name', 'required_date', 'status'],
};

const includeProductionPlan = {
  model: SProductionPlan,
  as: 'production_plan',
  attributes: ['id', 'plan_number', 'plan_description', 'status', 'earliest_delivery_date', 'latest_delivery_date'],
};

const includeMrpDetails = {
  model: SMrpDetail,
  as: 'details',
  include: [
    {
      model: SParts,
      as: 'part',
      attributes: ['id', 'part_number', 'part_name', 'safety_stock', 'lead_time_days', 'weight'],
      include: [{ model: SUom, as: 'uom', attributes: ['id', 'name', 'code'] }],
    },
    {
      model: SBoms,
      as: 'bom',
      attributes: ['id', 'bom_number', 'bom_version', 'description'],
    },
  ],
};

// ============================================================
// HELPER — generate nomor MRP: MRP-YYYY-MM-XXX
// Format baru: MRP-2026-06-001
//
// Strategy anti-duplikat:
//   - Query semua number dalam bulan berjalan, paranoid:false
//     agar soft-deleted records ikut terhitung
//   - Parse urutan terakhir dari kedua format lama & baru:
//       MRP-YYYY-MM-XXX     → e.g. MRP-2026-06-003
//       MRP-YYYYMMDD-XXXX   → e.g. MRP-20260601-0003
//   - Ambil nilai sequence terbesar, increment +1
//   - Format output selalu MRP-YYYY-MM-XXX (3 digit sequence)
//   - Dijalankan di dalam transaction yang sudah ada +
//     row-level lock untuk cegah race condition
// ============================================================
async function generateMrpNumber(transaction) {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const monthPrefix = `MRP-${yyyy}-${mm}`;

  const legacyPrefix = `MRP-${yyyy}${mm}`;

  const rows = await SMrp.findAll({
    attributes: ['number'],
    where: {
      [Op.or]: [
        { number: { [Op.like]: `${monthPrefix}-%` } }, 
        { number: { [Op.like]: `${legacyPrefix}%--%` } }, 
      ],
    },
    paranoid: false,
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  let maxSeq = 0;
  for (const row of rows) {
    const parts = row.number.split('-');
    const lastSegment = parts[parts.length - 1];
    const seq = parseInt(lastSegment, 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `${monthPrefix}-${nextSeq}`;
}

// ============================================================
// HELPER — ambil stok warehouse per part_id via raw query
// t_warehouse_stock tidak punya part_id langsung,
// stok dihitung dari qty_per_kanban di t_warehouse_stock_log
// dengan is_placement=true (masuk) dikurangi is_placement=false (keluar)
// ============================================================
async function getWarehouseStockByParts(partIds) {
  if (!partIds || partIds.length === 0) return {};

  const rows = await sequelize.query(
    `
    SELECT
      pl.part_id,
      COALESCE(SUM(
        CASE WHEN wsl.is_placement = true
             THEN wsl.qty_per_kanban
             ELSE -wsl.qty_per_kanban
        END
      ), 0) AS stock_qty
    FROM t_warehouse_stock ws
    INNER JOIN t_warehouse_stock_log wsl
      ON wsl.wh_stock_id = ws.id
      AND wsl.deleted_at IS NULL
    INNER JOIN t_work_order_storing_item_label woil
      ON woil.id = ws.wo_item_label_id
      AND woil.deleted_at IS NULL
    INNER JOIN t_part_labels pl
      ON pl.id = woil.label_id
      AND pl.deleted_at IS NULL
    WHERE ws.deleted_at IS NULL
      AND pl.part_id IN (:partIds)
    GROUP BY pl.part_id
    `,
    {
      replacements: { partIds },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const stockMap = {};
  for (const row of rows) {
    stockMap[row.part_id] = parseFloat(row.stock_qty) || 0;
  }
  return stockMap;
}

// ============================================================
// HELPER — BOM Explosion rekursif
// Menelusuri child_bom_id ke bawah sampai ketemu part RAW.
// Part bertipe WIP / PRODUCT / dsb. di-skip, tapi kalau mereka
// punya child_bom_id maka level berikutnya tetap ditelusuri.
//
// Parameter:
//   bomId        — ID BOM yang ditelusuri
//   qtyMultiplier — faktor pengali dari level parent
//   visited      — Set<bomId> untuk deteksi circular reference
//   result       — Map<part_id → { ...fields, qty }> akumulasi
// ============================================================
async function explodeBom(bomId, qtyMultiplier = 1, visited = new Set(), result = new Map()) {
  if (visited.has(bomId)) return result;
  visited.add(bomId);

  const details = await SBomDetails.findAll({
    where: { bom_id: bomId },
    attributes: ['id', 'bom_id', 'part_id', 'qty_required', 'scrap_percentage', 'child_bom_id'],
    include: [
      {
        model: SParts,
        as: 'part',
        attributes: ['id', 'part_number', 'part_name', 'part_type_code', 'safety_stock', 'lead_time_days', 'weight'],
        include: [{ model: SUom, as: 'uom', attributes: ['id', 'name', 'code'] }],
      },
    ],
  });

  for (const detail of details) {
    const rawPart = detail.part;
    if (!rawPart) continue;

    const qtyRequired = parseFloat(detail.qty_required || 0);
    const scrapPct = parseFloat(detail.scrap_percentage || 0);
    const effectiveQty = qtyRequired * (1 + scrapPct / 100) * qtyMultiplier;

    const typeCode = (rawPart.part_type_code || '').toUpperCase();

    if (typeCode === 'RAW') {
      const existing = result.get(rawPart.id);
      if (existing) {
        existing.qty += effectiveQty;
      } else {
        result.set(rawPart.id, {
          part_id: rawPart.id,
          bom_id: bomId,
          qty: effectiveQty,
          part: rawPart.toJSON(),
        });
      }
    } else if (detail.child_bom_id) {
      await explodeBom(detail.child_bom_id, effectiveQty, visited, result);
    }
    // Part bukan RAW dan tidak punya child_bom_id di-skip
  }

  return result;
}

class MRPModule extends BaseModule {

  // ============================================================
  // [GET] /mrp
  // List MRP — pagination, search, filter status
  // Aktor: Staff Material, Supervisor Material
  // ============================================================
  async list(req) {
    try {
      const params = req.query;
      const { search, status, spr_id, production_plan_id } = params;
      const { limit, page, offset } = helper.getPagination(params);

      const where = {};
      if (search) {
        where[Op.or] = [
          { number: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } },
        ];
      }
      if (status) where.status = status;
      if (spr_id) where.spr_id = spr_id;
      if (production_plan_id) where.production_plan_id = production_plan_id;

      const { count, rows } = await SMrp.findAndCountAll({
        where,
        include: [includeSalesPlan, includeProductionPlan, includeCreator, includeApprover],
        limit,
        offset,
        order: [['created_at', 'DESC']],
        distinct: true,
      });

      return { status: true, data: helper.getPaginationData(rows, count, page, limit) };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ============================================================
  // [GET] /mrp/:id
  // Detail MRP beserta detail items
  // Aktor: Staff Material, Supervisor Material
  // ============================================================
  async detail(req) {
    try {
      const { id } = req.params;

      const mrp = await SMrp.findByPk(id, {
        include: [includeSalesPlan, includeProductionPlan, includeMrpDetails, includeCreator, includeApprover],
      });

      if (!mrp) return { status: false, message: 'MRP not found', code: 404 };

      // Ambil stok warehouse untuk tiap part di detail
      const partIds = mrp.details.map((d) => d.part_id);
      const stockMap = await getWarehouseStockByParts(partIds);

      // Inject stock_qty dan hitung shortage ke tiap detail
      const detailsWithStock = mrp.details.map((d) => {
        const plain = d.toJSON();
        const stockQty = stockMap[d.part_id] || 0;
        return {
          ...plain,
          stock_qty: stockQty,
          shortage_qty: Math.max(0, parseFloat(d.qty) - stockQty),
        };
      });

      return { status: true, data: { ...mrp.toJSON(), details: detailsWithStock } };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ============================================================
  // [GET] /mrp/sales-plan/:spr_id/load
  // Load data Sales Plan + BOM Explosion rekursif + warehouse stock
  // Dipanggil saat Staff memilih Sales Plan di form Create MRP.
  //
  // Alur BOM Explosion:
  //   1. Cari BOM utama (top-level) berdasarkan parent_part_id dari SPR.
  //   2. Telusuri setiap BOM secara rekursif via child_bom_id.
  //   3. Kumpulkan HANYA part bertipe RAW (skip WIP/PRODUCT/dll).
  //   4. Akumulasi qty dengan memperhitungkan scrap & qty produk.
  //   5. Response menyertakan `primary_bom` (BOM utama) untuk
  //      ditampilkan sebagai field disabled di frontend.
  //
  // Aktor: Staff Material
  // ============================================================
  async loadSalesPlanData(req) {
    try {
      const { spr_id } = req.params;

      // ── STEP 1: Ambil SPR header ──────────────────────────────────
      const spr = await SSalesPurchaseRequests.findByPk(spr_id, {
        attributes: ['id', 'spr_number', 'spr_name', 'required_date', 'status'],
      });
      if (!spr) return { status: false, message: 'Sales Plan not found', code: 404 };

      // ── STEP 2: Ambil SPR details → kumpulkan part_id produk ──────
      const sprDetails = await SSalesPurchaseRequestDetails.findAll({
        where: { spr_id },
        include: [
          {
            model: SParts,
            as: 'part',
            attributes: ['id', 'part_number', 'part_name', 'part_type_code'],
          },
        ],
      });

      if (!sprDetails || sprDetails.length === 0) {
        return {
          status: true,
          data: {
            spr: spr.toJSON(),
            primary_bom: null,
            products: [],
            suggestedDetails: [],
            warehouseStock: [],
            skipped_products: [],
            total_materials: 0,
          },
        };
      }

      const productQtyMap = {};
      for (const d of sprDetails) {
        productQtyMap[d.part_id] = d.qty || 0;
      }
      const productPartIds = Object.keys(productQtyMap).map(Number);

      // ── STEP 3: Cari BOM utama per produk ────────────────────────
      // Prioritas: Approved (doc_status_id=3) + Active (activation_status_id=1)
      // Fallback 1: Approved saja
      // Fallback 2: BOM apapun yang ada (dev/data belum lengkap)
      let boms = await SBoms.findAll({
        where: { parent_part_id: { [Op.in]: productPartIds }, doc_status: 'Approved', activation_status: 'Active' },
        attributes: ['id', 'bom_number', 'bom_version', 'description', 'parent_part_id'],
        order: [['id', 'DESC']],
      });

      if (boms.length === 0) {
        boms = await SBoms.findAll({
          where: { parent_part_id: { [Op.in]: productPartIds }, doc_status_id: 3 },
          attributes: ['id', 'bom_number', 'bom_version', 'description', 'parent_part_id'],
          order: [['id', 'DESC']],
        });
      }

      if (boms.length === 0) {
        boms = await SBoms.findAll({
          where: { parent_part_id: { [Op.in]: productPartIds } },
          attributes: ['id', 'bom_number', 'bom_version', 'description', 'parent_part_id'],
          order: [['id', 'DESC']],
        });
      }

      const skippedProducts = [];

      if (boms.length === 0) {
        for (const d of sprDetails) {
          skippedProducts.push({ part_number: d.part?.part_number, reason: 'No approved BOM' });
        }
        return {
          status: true,
          data: {
            spr: spr.toJSON(),
            primary_bom: null,
            products: sprDetails.map((d) => ({
              part_id: d.part_id,
              part_number: d.part?.part_number,
              part_name: d.part?.part_name,
              qty_request: d.qty,
              has_bom: false,
            })),
            suggestedDetails: [],
            warehouseStock: [],
            skipped_products: skippedProducts,
            total_materials: 0,
          },
        };
      }

      // Map: parent_part_id → bom utama (ambil BOM pertama/terbaru per produk)
      const bomByProductPartId = {};
      for (const bom of boms) {
        if (!bomByProductPartId[bom.parent_part_id]) {
          bomByProductPartId[bom.parent_part_id] = bom;
        }
      }

      // Produk yang tidak punya BOM — catat ke skippedProducts
      for (const partId of productPartIds) {
        if (!bomByProductPartId[partId]) {
          const d = sprDetails.find((s) => s.part_id === partId);
          skippedProducts.push({ part_number: d?.part?.part_number, reason: 'No approved BOM' });
        }
      }

      // ── STEP 4: BOM Explosion rekursif per produk ─────────────────
      // Untuk setiap produk di SPR, jalankan explodeBom() dengan
      // qty_multiplier = qty produk dari SPR.
      // Hasilnya diakumulasikan ke satu Map global (rawMaterialAccum).
      //
      // Kenapa per-produk, bukan sekali untuk semua bom_id?
      //   → Karena setiap produk bisa punya qty berbeda di SPR,
      //     dan kita butuh mengalikan qty BOM dengan qty produk.
      const rawMaterialAccum = new Map();

      for (const partId of productPartIds) {
        const topBom = bomByProductPartId[partId];
        if (!topBom) continue;

        const qtyProduct = productQtyMap[partId] || 0;
        if (qtyProduct <= 0) continue;

        
        const productResult = await explodeBom(topBom.id, qtyProduct, new Set(), new Map());

        
        for (const [rawPartId, item] of productResult.entries()) {
          const existing = rawMaterialAccum.get(rawPartId);
          if (existing) {
            existing.qty += item.qty;
          } else {
            rawMaterialAccum.set(rawPartId, {
              ...item,
              bom_id: topBom.id,
              bom_number: topBom.bom_number,
            });
          }
        }
      }

      // ── STEP 5: Ambil stok warehouse & susun response ─────────────
      const allRawPartIds = [...rawMaterialAccum.keys()];
      const stockMap = await getWarehouseStockByParts(allRawPartIds);

      const TARGET_SAFETY_STOCK = 50;

      const suggestedDetails = [...rawMaterialAccum.values()].map((item) => {
        const grossRequirement = Math.ceil(item.qty);
        const stockOnHand = stockMap[item.part_id] || 0;
        const currentSafetyStock = item.part?.safety_stock ?? 0;
        // Net Req = Gross + Target Safety (50) - (Stock On-Hand + Current Safety Stock)
        const netRequirement = Math.max(0, grossRequirement + TARGET_SAFETY_STOCK - (stockOnHand + currentSafetyStock));
        return {
          part_id: item.part_id,
          bom_id: item.bom_id,
          bom_number: item.bom_number,
          gross_requirement: grossRequirement,
          stock_on_hand: stockOnHand,
          current_safety_stock: currentSafetyStock,
          target_safety_stock: TARGET_SAFETY_STOCK,
          net_requirement: netRequirement,
          qty: netRequirement,
          stock_qty: stockOnHand,
          shortage_qty: Math.max(0, grossRequirement - stockOnHand),
          part: item.part,
          notes: `Auto-calculated from SPR: ${spr.spr_number}`,
        };
      });

      // BOM utama untuk ditampilkan sebagai field read-only di frontend.
      // Jika SPR punya banyak produk, ambil BOM pertama yang ditemukan
      // (umumnya satu SPR = satu produk utama).
      const firstBom = Object.values(bomByProductPartId)[0] ?? null;
      const primaryBom = firstBom
        ? {
            id: firstBom.id,
            bom_number: firstBom.bom_number,
            bom_version: firstBom.bom_version,
            description: firstBom.description,
            // Label yang ditampilkan di field disabled frontend:
            // contoh: "BOM-2025-001 (v2)"
            display_label: `${firstBom.bom_number} (v${firstBom.bom_version ?? 1})`,
          }
        : null;

      return {
        status: true,
        data: {
          spr: spr.toJSON(),
          // ← field baru: info BOM utama untuk field disabled di frontend
          primary_bom: primaryBom,
          products: sprDetails.map((d) => ({
            part_id: d.part_id,
            part_number: d.part?.part_number,
            part_name: d.part?.part_name,
            qty_request: d.qty,
            has_bom: !!bomByProductPartId[d.part_id],
          })),
          suggestedDetails,         // hanya RAW, hasil BOM explosion rekursif
          warehouseStock: allRawPartIds.map((id) => ({
            part_id: id,
            qty_on_hand: stockMap[id] || 0,
          })),
          skipped_products: skippedProducts,
          total_materials: suggestedDetails.length,
          _debug: {
            product_part_ids: productPartIds,
            top_level_bom_ids: Object.values(bomByProductPartId).map((b) => b.id),
            raw_part_count_after_explosion: allRawPartIds.length,
          },
        },
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ============================================================
  // [POST] /mrp
  // Buat MRP Draft dari Sales Plan
  // Body: { spr_id, description, priority, notes, details[], save_as_draft }
  //   - save_as_draft: true  → status Draft
  //   - save_as_draft: false → status Submitted (langsung submit)
  // Aktor: Staff Material
  // ============================================================
  async createDraft(req) {
    const transaction = await sequelize.transaction();
    try {
      const { spr_id, production_plan_id, description, priority, notes, details, save_as_draft = true } = req.body;
      const user_id = req.user?.id;

      // Validasi wajib
      const mandatory = helper.checkMandatory(req.body, ['description', 'details']);
      if (!mandatory.status) { await transaction.rollback(); return mandatory; }

      if (!details || !Array.isArray(details) || details.length === 0) {
        await transaction.rollback();
        return { status: false, message: 'Details material wajib diisi', code: 400 };
      }

      // Validasi priority
      if (priority && !PRIORITY_VALUES.includes(priority)) {
        await transaction.rollback();
        return { status: false, message: `Priority harus salah satu dari: ${PRIORITY_VALUES.join(', ')}`, code: 400 };
      }

      // Validasi Sales Plan jika dilampirkan
      if (spr_id) {
        const spr = await SSalesPurchaseRequests.findByPk(spr_id, { transaction });
        if (!spr) { await transaction.rollback(); return { status: false, message: 'Sales Plan not found', code: 404 }; }
        if (!['Approved', 'Waiting PPIC'].includes(spr.status)) {
          await transaction.rollback();
          return { status: false, message: `Sales Plan harus berstatus Approved/Waiting PPIC. Status saat ini: ${spr.status}`, code: 400 };
        }
      }

      // Validasi Production Plan jika dilampirkan
      if (production_plan_id) {
        const plan = await SProductionPlan.findByPk(production_plan_id, { transaction });
        if (!plan) { await transaction.rollback(); return { status: false, message: 'Production Plan not found', code: 404 }; }
        if (plan.status !== 'Approved') {
          await transaction.rollback();
          return { status: false, message: `Production Plan harus Approved. Status saat ini: ${plan.status}`, code: 400 };
        }
      }

      // Validasi tiap detail
      for (const d of details) {
        if (!d.part_id) { await transaction.rollback(); return { status: false, message: 'Setiap detail harus memiliki part_id', code: 400 }; }
        if (!d.qty || parseFloat(d.qty) <= 0) { await transaction.rollback(); return { status: false, message: 'Setiap detail harus memiliki qty > 0', code: 400 }; }
      }

      const targetStatus = save_as_draft ? MRP_STATUS.DRAFT : MRP_STATUS.SUBMITTED;
      const mrpNumber = await generateMrpNumber(transaction);

      const mrp = await SMrp.create(
        {
          spr_id: spr_id || null,
          production_plan_id: production_plan_id || null,
          number: mrpNumber,
          description,
          priority: priority || null,
          notes: notes || null,
          status: targetStatus,
          created_by: user_id,
        },
        { transaction }
      );

      const detailData = details.map((d) => ({
        mrp_id: mrp.id,
        part_id: d.part_id,
        bom_id: d.bom_id || null,
        qty: d.qty,
        notes: d.notes || null,
      }));

      await SMrpDetail.bulkCreate(detailData, { transaction });
      await transaction.commit();

      return {
        status: true,
        message: save_as_draft ? 'MRP berhasil disimpan sebagai Draft' : 'MRP berhasil disubmit ke Supervisor Material',
        data: { id: mrp.id, number: mrp.number, status: mrp.status },
      };
    } catch (error) {
      await transaction.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ============================================================
  // [PUT] /mrp/:id
  // Update header MRP — hanya saat Draft
  // Aktor: Staff Material, Supervisor Material (saat edit sebelum approve)
  // ============================================================
  async update(req) {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { description, priority, notes, save_as_draft = true } = req.body;

      const mrp = await SMrp.findByPk(id, { transaction });
      if (!mrp) { await transaction.rollback(); return { status: false, message: 'MRP not found', code: 404 }; }

      if (![MRP_STATUS.DRAFT, MRP_STATUS.SUBMITTED].includes(mrp.status)) {
        await transaction.rollback();
        return { status: false, message: `MRP tidak bisa diedit. Status: ${mrp.status}`, code: 400 };
      }

      if (priority && !PRIORITY_VALUES.includes(priority)) {
        await transaction.rollback();
        return { status: false, message: `Priority harus salah satu dari: ${PRIORITY_VALUES.join(', ')}`, code: 400 };
      }

      const targetStatus = save_as_draft ? MRP_STATUS.DRAFT : MRP_STATUS.SUBMITTED;

      await mrp.update({ description, priority, notes, status: targetStatus }, { transaction });
      await transaction.commit();

      return {
        status: true,
        message: save_as_draft ? 'MRP berhasil disimpan sebagai Draft' : 'MRP berhasil disubmit ke Supervisor Material',
      };
    } catch (error) {
      await transaction.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ============================================================
  // [PUT] /mrp/:id/detail
  // Update detail items MRP — replace strategy, hanya saat Draft/Submitted
  // Aktor: Staff Material, Supervisor Material (saat edit sebelum approve)
  // ============================================================
  async updateDetails(req) {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { details } = req.body;

      const mrp = await SMrp.findByPk(id, { transaction });
      if (!mrp) { await transaction.rollback(); return { status: false, message: 'MRP not found', code: 404 }; }

      if (![MRP_STATUS.DRAFT, MRP_STATUS.SUBMITTED].includes(mrp.status)) {
        await transaction.rollback();
        return { status: false, message: `Detail MRP tidak bisa diedit. Status: ${mrp.status}`, code: 400 };
      }

      if (!details || !Array.isArray(details) || details.length === 0) {
        await transaction.rollback();
        return { status: false, message: 'Details wajib diisi dan tidak boleh kosong', code: 400 };
      }

      for (const d of details) {
        if (!d.part_id) { await transaction.rollback(); return { status: false, message: 'Setiap detail harus memiliki part_id', code: 400 }; }
        if (!d.qty || parseFloat(d.qty) <= 0) { await transaction.rollback(); return { status: false, message: 'Setiap detail harus memiliki qty > 0', code: 400 }; }
      }

      await SMrpDetail.destroy({ where: { mrp_id: id }, transaction });

      const detailData = details.map((d) => ({
        mrp_id: parseInt(id),
        part_id: d.part_id,
        bom_id: d.bom_id || null,
        qty: d.qty,
        notes: d.notes || null,
      }));

      await SMrpDetail.bulkCreate(detailData, { transaction });
      await transaction.commit();

      return { status: true, message: 'Detail MRP berhasil diupdate', data: { total_items: detailData.length } };
    } catch (error) {
      await transaction.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ============================================================
  // [PUT] /mrp/:id/submit
  // Staff Material submit MRP: Draft → Submitted
  // Aktor: Staff Material
  // ============================================================
  async submit(req) {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;

      const mrp = await SMrp.findByPk(id, {
        include: [{ model: SMrpDetail, as: 'details' }],
        transaction,
      });

      if (!mrp) { await transaction.rollback(); return { status: false, message: 'MRP not found', code: 404 }; }

      if (mrp.status !== MRP_STATUS.DRAFT) {
        await transaction.rollback();
        return { status: false, message: `Hanya MRP Draft yang bisa disubmit. Status: ${mrp.status}`, code: 400 };
      }

      if (!mrp.details || mrp.details.length === 0) {
        await transaction.rollback();
        return { status: false, message: 'MRP harus memiliki minimal 1 detail material sebelum disubmit', code: 400 };
      }

      await mrp.update({ status: MRP_STATUS.SUBMITTED }, { transaction });
      await transaction.commit();

      return {
        status: true,
        message: 'MRP berhasil disubmit dan menunggu approval Supervisor Material',
        data: { id: mrp.id, number: mrp.number, status: MRP_STATUS.SUBMITTED },
      };
    } catch (error) {
      await transaction.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ============================================================
  // [PUT] /mrp/bulk-review
  // Supervisor approve/reject BANYAK MRP sekaligus (via checkbox)
  // Body: { ids: [1,2,3], action: 'approve'|'reject', notes: '...' }
  // Aktor: Supervisor Material
  // ============================================================
  async bulkReview(req) {
    const transaction = await sequelize.transaction();
    try {
      const { ids, action, notes } = req.body;
      const user_id = req.user?.id;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        await transaction.rollback();
        return { status: false, message: 'IDs wajib diisi dan tidak boleh kosong', code: 400 };
      }

      if (!action || !['Approve', 'Reject'].includes(action)) {
        await transaction.rollback();
        return { status: false, message: "Action harus 'Approve' atau 'Reject'", code: 400 };
      }

      if (action === 'Reject' && !notes) {
        await transaction.rollback();
        return { status: false, message: 'Alasan penolakan (notes) wajib diisi saat Reject', code: 400 };
      }

      // Ambil semua MRP yang diminta, pastikan statusnya Submitted
      const mrps = await SMrp.findAll({
        where: { id: { [Op.in]: ids }, status: MRP_STATUS.SUBMITTED },
        transaction,
      });

      if (mrps.length === 0) {
        await transaction.rollback();
        return { status: false, message: 'Tidak ada MRP Submitted yang ditemukan dari IDs yang diberikan', code: 404 };
      }

      const newStatus = action === 'Approve' ? MRP_STATUS.APPROVED : MRP_STATUS.REJECTED;
      const foundIds = mrps.map((m) => m.id);

      await SMrp.update(
        {
          status: newStatus,
          approved_by: user_id,
          ...(action === 'Reject' ? { rejected_notes: notes } : {}),
        },
        { where: { id: { [Op.in]: foundIds } }, transaction }
      );

      await transaction.commit();

      // Informasikan jika ada ID yang tidak bisa diproses
      const notProcessed = ids.filter((id) => !foundIds.includes(id));

      return {
        status: true,
        message: `${foundIds.length} MRP berhasil di-${newStatus}`,
        data: {
          processed: foundIds,
          not_processed: notProcessed,
          reason_not_processed: notProcessed.length > 0 ? 'MRP tidak ditemukan atau statusnya bukan Submitted' : null,
        },
      };
    } catch (error) {
      await transaction.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ============================================================
  // [PUT] /mrp/:id/review
  // Supervisor approve/reject SATU MRP
  // Body: { action: 'approve'|'reject', notes: '...' }
  // Aktor: Supervisor Material
  // ============================================================
  async review(req) {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { action, notes } = req.body;
      const user_id = req.user?.id;

      if (!action || !['Approve', 'Reject'].includes(action)) {
        await transaction.rollback();
        return { status: false, message: "Action harus 'Approve' atau 'Reject'", code: 400 };
      }

      if (action === 'Reject' && !notes) {
        await transaction.rollback();
        return { status: false, message: 'Alasan penolakan (notes) wajib diisi saat Reject', code: 400 };
      }

      const mrp = await SMrp.findByPk(id, { transaction });
      if (!mrp) { await transaction.rollback(); return { status: false, message: 'MRP not found', code: 404 }; }

      if (mrp.status !== MRP_STATUS.SUBMITTED) {
        await transaction.rollback();
        return { status: false, message: `Hanya MRP Submitted yang bisa di-review. Status: ${mrp.status}`, code: 400 };
      }

      const newStatus = action === 'Approve' ? MRP_STATUS.APPROVED : MRP_STATUS.REJECTED;

      await mrp.update(
        {
          status: newStatus,
          approved_by: user_id,
          ...(action === 'Reject' ? { rejected_notes: notes } : {}),
        },
        { transaction }
      );

      await transaction.commit();

      return {
        status: true,
        message: `MRP berhasil di-${newStatus}`,
        data: { id: mrp.id, number: mrp.number, status: newStatus },
      };
    } catch (error) {
      await transaction.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ============================================================
  // [DELETE] /mrp/:id
  // Hapus MRP Draft beserta detail-nya (soft delete)
  // Aktor: Staff Material
  // ============================================================
  async deleteDraft(req) {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;

      const mrp = await SMrp.findByPk(id, { transaction });
      if (!mrp) { await transaction.rollback(); return { status: false, message: 'MRP not found', code: 404 }; }

      if (mrp.status !== MRP_STATUS.DRAFT) {
        await transaction.rollback();
        return { status: false, message: `Hanya MRP Draft yang bisa dihapus. Status: ${mrp.status}`, code: 400 };
      }

      await SMrpDetail.destroy({ where: { mrp_id: id }, transaction });
      await mrp.destroy({ transaction });

      await transaction.commit();
      return { status: true, message: 'MRP berhasil dihapus' };
    } catch (error) {
      await transaction.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ============================================================
  // DROPDOWN ENDPOINTS
  // ============================================================

  // [GET] /mrp/dropdown/sales-plans
  // Sales Purchase Request yang Approved/Waiting PPIC — pilihan saat create MRP
  // Aktor: Staff Material
  async getDropdownSalesPlans(req) {
    try {
      const usedMrps = await SMrp.findAll({
        attributes: ['spr_id'],
        where: {
          spr_id: { [Op.not]: null }
        }
      });

      const usedSprIds = usedMrps.map(mrp => mrp.spr_id);

      const plans = await SSalesPurchaseRequests.findAll({
        where: {
          status: { [Op.in]: ['Approved', 'Waiting PPIC'] },
          id: {
            [Op.notIn]: usedSprIds
          }
        },
        attributes: ['id', 'spr_number', 'spr_name', 'description', 'status'],
        order: [['created_at', 'DESC']],
        limit: 50,
      });

      return { status: true, data: plans };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // [GET] /mrp/dropdown/parts
  // Parts/komponen — untuk input detail MRP manual
  // Support search
  // Aktor: Staff Material, Supervisor Material
  async getDropdownParts(req) {
    try {
      const { search } = req.query;

      // Hanya tampilkan parts dengan part_type_code = 'RAW' (Raw Material)
      // Menggunakan Op.in untuk case-insensitive safety (RAW / Raw / raw)
      const where = { part_type_code: { [Op.in]: ['RAW', 'Raw', 'raw'] } };

      if (search) {
        where[Op.or] = [
          { part_number: { [Op.like]: `%${search}%` } },
          { part_name: { [Op.like]: `%${search}%` } },
        ];
      }

      const rows = await SParts.findAll({
        where,
        attributes: ['id', 'part_number', 'part_name', 'safety_stock', 'lead_time_days', 'weight'],
        include: [{ model: SUom, as: 'uom', attributes: ['id', 'name', 'code'] }],
        order: [['part_number', 'ASC']],
        limit: 50,
      });

      return { status: true, data: rows };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // [GET] /mrp/dropdown/status
  // Daftar status MRP untuk filter list
  // Aktor: Staff Material, Supervisor Material
  async getDropdownStatuses(req) {
    try {
      return {
        status: true,
        data: Object.values(MRP_STATUS),
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // [GET] /mrp/dropdown/priority
  // Daftar nilai priority MRP
  // Aktor: Staff Material
  async getDropdownPriority(req) {
    try {
      return {
        status: true,
        data: PRIORITY_VALUES,
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // [GET] /mrp/dashboard/critical-parts
  // Mengambil daftar material kritis (stok <= 10) untuk dasbor
  // Aktor: Semua (Dashboard)
  async getDashboardCriticalParts(req) {
    try {
      // Cari 5 material paling kritis untuk list
      const rows = await SParts.findAll({
        where: {
          part_type_code: 'RAW', // Hanya filter bahan baku
          safety_stock: { [Op.lte]: 10 } // Batas kritis <= 10
        },
        attributes: ['id', 'part_number', 'part_name', 'safety_stock', 'uom_id'],
        include: [{ model: SUom, as: 'uom', attributes: ['id', 'name', 'code'] }],
        order: [['safety_stock', 'ASC']], // Urutkan dari stok yang paling sedikit
        limit: 5,
      });

      // Hitung total seluruh material yang kritis untuk angka di Metric Card
      const totalCritical = await SParts.count({
        where: {
          part_type_code: 'RAW',
          safety_stock: { [Op.lte]: 10 }
        }
      });

      return { 
        status: true, 
        data: { 
          parts: rows, 
          total: totalCritical 
        } 
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }Z
}

export default new MRPModule();