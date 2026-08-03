import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import dayjs from 'dayjs';

const {
    SMaterialPurchaseOrder,
    SMaterialPurchaseOrderLog,
    TMaterialPurchaseOrderDetail,
    SMaterialPurchaseRequest,
    TMaterialPurchaseRequestDetail,
    SSuppliers,
    SWarehouses,
    SParts,
    SUsers,
    SUserDetail
} = db;

class MPOModule extends BaseModule {

    // ============================================================
    // PRIVATE HELPERS
    // ============================================================

    async _generateMpoNumber(transaction) {
        const currentMonthStr = dayjs().format('YYYY-MM');
        const prefix = `MPO-${currentMonthStr}`;

        const lastMpo = await SMaterialPurchaseOrder.findOne({
            where: { number: { [Op.like]: `${prefix}-%` } },
            order: [['number', 'DESC']],
            transaction,
            paranoid: false
        });

        let seq = 1;
        if (lastMpo) {
            const parts = lastMpo.number.split('-');
            const lastSeqStr = parts[parts.length - 1];
            if (!isNaN(lastSeqStr)) seq = parseInt(lastSeqStr, 10) + 1;
        }

        return `${prefix}-${seq.toString().padStart(3, '0')}`;
    }

    async _logAction(mpo_id, action, notes = null, transaction = null, user_id = null, status = null) {
        await SMaterialPurchaseOrderLog.create(
            { mpo_id, action, notes, user_id, status },
            { transaction }
        );
    }

    // ============================================================
    // DROPDOWN
    // ============================================================

    async getDropdownStatuses(req) {
        return {
            status: true,
            data: ['Draft', 'Submitted', 'Approved', 'Rejected']
        };
    }

    /**
     * GET /dd-source
     * Returns two lists: approved MPRs and approved MRPs that still have
     * at least one part with REMAINING QTY not yet allocated to an active MPO.
     *
     * FIX v3: Sebelumnya filter berbasis part_id ada/tidak-ada di MPO aktif (binary).
     * Itu salah untuk kasus split-per-supplier: 1 part dengan qty 8 bisa di-split
     * jadi MPO A (qty 5, supplier X) dan MPO B (qty 3, supplier Y). Kalau MPO A
     * dihapus, qty 5 itu harus kembali available — TAPI part_id-nya sendiri masih
     * "ada" di MPO B (qty 3) yang masih aktif, sehingga filter binary lama keliru
     * menganggap part itu masih full terpakai dan menyembunyikan source-nya.
     *
     * Sekarang dihitung per part_id: SUM(qty) dari semua MPO aktif (belum dihapus,
     * status draft/submitted/approved) dibandingkan dengan qty asli di source detail.
     * Part dianggap exhausted hanya jika sisa qty <= 0. Source muncul di dropdown
     * selama ada >= 1 part dengan sisa qty > 0.
     */
    async getDropdownSource(req) {
        try {
            const [mprs, mrps] = await Promise.all([
                SMaterialPurchaseRequest.findAll({
                    where: { status: 'approved' },
                    attributes: ['id', 'number', 'description', 'request_date'],
                    include: [{
                        model: TMaterialPurchaseRequestDetail,
                        as: 'details',
                        attributes: ['part_id', 'qty']
                    }],
                    order: [['number', 'ASC']]
                }),
                db.SMrp.findAll({
                    where: { status: 'Approved' },
                    attributes: ['id', 'number', 'description'],
                    include: [{
                        model: db.SMrpDetail,
                        as: 'details',
                        attributes: ['part_id', 'qty']
                    }],
                    order: [['number', 'ASC']]
                })
            ]);

            // Ambil part_id + qty dari MPO aktif (draft/submitted/approved, belum dihapus),
            // dikelompokkan per source, supaya bisa hitung SISA qty yang masih available.
            const [usedMprPartRows, usedMrpPartRows] = await Promise.all([
                mprs.length > 0 ? TMaterialPurchaseOrderDetail.findAll({
                    attributes: ['part_id', 'qty'],
                    include: [{
                        model: SMaterialPurchaseOrder,
                        as: 'purchase_order',
                        attributes: ['mpr_id'],
                        where: {
                            mpr_id: { [Op.in]: mprs.map(m => m.id) },
                            deleted_at: null,
                            status: { [Op.in]: ['draft', 'submitted', 'approved'] }
                        },
                        required: true
                    }],
                    raw: true
                }) : [],
                mrps.length > 0 ? TMaterialPurchaseOrderDetail.findAll({
                    attributes: ['part_id', 'qty'],
                    include: [{
                        model: SMaterialPurchaseOrder,
                        as: 'purchase_order',
                        attributes: ['mrp_id'],
                        where: {
                            mrp_id: { [Op.in]: mrps.map(m => m.id) },
                            deleted_at: null,
                            status: { [Op.in]: ['draft', 'submitted', 'approved'] }
                        },
                        required: true
                    }],
                    raw: true
                }) : []
            ]);

            // Bangun map source_id -> Map(part_id -> total qty terpakai)
            const usedQtyByMpr = new Map();
            for (const row of usedMprPartRows) {
                const sourceId = row['purchase_order.mpr_id'];
                if (!usedQtyByMpr.has(sourceId)) usedQtyByMpr.set(sourceId, new Map());
                const partMap = usedQtyByMpr.get(sourceId);
                partMap.set(row.part_id, (partMap.get(row.part_id) || 0) + Number(row.qty));
            }
            const usedQtyByMrp = new Map();
            for (const row of usedMrpPartRows) {
                const sourceId = row['purchase_order.mrp_id'];
                if (!usedQtyByMrp.has(sourceId)) usedQtyByMrp.set(sourceId, new Map());
                const partMap = usedQtyByMrp.get(sourceId);
                partMap.set(row.part_id, (partMap.get(row.part_id) || 0) + Number(row.qty));
            }

            // Source lolos kalau >= 1 part punya sisa qty > 0 (qty asli - qty terpakai).
            const mprsWithRemaining = mprs.filter(m => {
                const usedQty = usedQtyByMpr.get(m.id) || new Map();
                return (m.details || []).some(d => Number(d.qty) - (usedQty.get(d.part_id) || 0) > 0);
            });
            const mrpsWithRemaining = mrps.filter(m => {
                const usedQty = usedQtyByMrp.get(m.id) || new Map();
                return (m.details || []).some(d => Number(d.qty) - (usedQty.get(d.part_id) || 0) > 0);
            });

            // Flat array gabungan MRP + MPR untuk dropdown frontend
            const combined = [
                ...mrpsWithRemaining.map(m => ({
                    label: m.number,
                    source_type: 'mrp',
                    source_id: m.id,
                    description: m.description
                })),
                ...mprsWithRemaining.map(m => ({
                    label: m.number,
                    source_type: 'mpr',
                    source_id: m.id,
                    description: m.description
                }))
            ].sort((a, b) => a.label.localeCompare(b.label));

            return { status: true, data: combined };
        } catch (error) {
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    /**
     * GET /dd-supplier?search=:keyword&part_ids=1,2,3
     *
     * Jika `part_ids` dikirim, hanya tampilkan supplier yang terdaftar
     * di tabel junction s_part_suppliers untuk part-part tersebut.
     * Jika tidak ada `part_ids`, fallback ke semua supplier (backward compat).
     */
    async getDropdownSupplier(req) {
        try {
            const { search, part_ids } = req.query;
            const where = {};

            if (search) {
                where[Op.or] = [
                    { supplier_code: { [Op.like]: `%${search}%` } },
                    { name: { [Op.like]: `%${search}%` } },
                ];
            }

            // Jika part_ids dikirim, filter supplier yang relevan via junction table
            const parsedPartIds = part_ids
                ? part_ids.split(',').map(Number).filter(Boolean)
                : [];

            let rows;

            if (parsedPartIds.length > 0) {
                let filtered = await SSuppliers.findAll({
                    where,
                    attributes: ['id', 'supplier_code', 'name', 'email'],
                    include: [{
                        model: db.SPartSuppliers,
                        as: 'part_suppliers',
                        attributes: ['part_id', 'is_primary'],
                        where: { part_id: { [Op.in]: parsedPartIds } },
                        required: true, // INNER JOIN, hanya supplier yang terdaftar
                    }],
                    order: [['name', 'ASC']],
                    limit: 50,
                });

                if (filtered.length > 0) {
                    rows = filtered.map(s => {
                        const plain = s.toJSON();
                        delete plain.part_suppliers;
                        return plain;
                    });
                } else {
                    rows = await SSuppliers.findAll({
                        where,
                        attributes: ['id', 'supplier_code', 'name', 'email'],
                        order: [['name', 'ASC']],
                        limit: 50,
                    });
                }
            } else {
                rows = await SSuppliers.findAll({
                    where,
                    attributes: ['id', 'supplier_code', 'name', 'email'],
                    order: [['name', 'ASC']],
                    limit: 50,
                });
            }

            return { status: true, data: rows };
        } catch (error) {
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // GET SOURCE DATA (auto-fill form)
    // ============================================================

    /**
     * GET /source-data/:source_type/:source_id
     * source_type: 'mpr' | 'mrp'
     */
    async getSourceData(req) {
        try {
            const { source_type, source_id } = req.params;

            if (!['mpr', 'mrp'].includes(source_type)) {
                return { status: false, message: 'source_type must be mpr or mrp', code: 400 };
            }

            if (source_type === 'mpr') {
                const mpr = await SMaterialPurchaseRequest.findOne({
                    where: { id: source_id, status: 'approved' },
                    include: [{
                        model: TMaterialPurchaseRequestDetail,
                        as: 'details',
                        include: [{
                            model: SParts,
                            as: 'part',
                            attributes: ['id', 'part_number', 'part_name', 'price', 'weight'],
                            include: [
                                { model: db.SUom, as: 'uom', attributes: ['id', 'name', 'code'] },
                                // [M2M] Ambil semua supplier yang bisa handle part ini
                                // via tabel junction s_part_suppliers (as: 'suppliers')
                                {
                                    model: SSuppliers,
                                    as: 'suppliers',
                                    attributes: ['id', 'supplier_code', 'name'],
                                    through: {
                                        model: db.SPartSuppliers,
                                        attributes: ['is_primary']
                                    }
                                }
                            ]
                        }]
                    }]
                });

                if (!mpr) return { status: false, message: 'Purchase Request not found or not approved', code: 404 };

                // Kumpulkan SISA qty per part_id yang sudah ada di MPO aktif (draft/submitted/approved)
                // untuk source MPR ini. FIX v3: dulu binary (part_id ada -> sembunyikan semua),
                // sekarang SUM qty per part supaya kasus split-per-supplier (qty terbagi ke beberapa
                // MPO/supplier) tetap menyisakan qty yang benar saat salah satu MPO split dihapus.
                const usedQtyRows = await TMaterialPurchaseOrderDetail.findAll({
                    attributes: ['part_id', 'qty'],
                    include: [{
                        model: SMaterialPurchaseOrder,
                        as: 'purchase_order',
                        attributes: [],
                        where: {
                            mpr_id: mpr.id,
                            deleted_at: null,
                            status: { [Op.in]: ['draft', 'submitted', 'approved'] }
                        },
                        required: true
                    }],
                    raw: true
                });
                const usedQtyByPart = new Map();
                for (const row of usedQtyRows) {
                    usedQtyByPart.set(row.part_id, (usedQtyByPart.get(row.part_id) || 0) + Number(row.qty));
                }

                const availableDetails = (mpr.details || [])
                    .map(d => {
                        const remainingQty = Number(d.qty) - (usedQtyByPart.get(d.part_id) || 0);
                        return { ...d.toJSON ? d.toJSON() : d, remainingQty };
                    })
                    .filter(d => d.remainingQty > 0);

                return {
                    status: true,
                    data: {
                        source_type: 'mpr',
                        source_id: mpr.id,
                        source_number: mpr.number,
                        details: availableDetails.map(d => ({
                            part_id: d.part_id,
                            qty: d.remainingQty, // sisa qty yang benar-benar masih bisa di-generate
                            notes: d.notes,
                            part: d.part
                        }))
                    }
                };
            } else {
                const mrp = await db.SMrp.findOne({
                    where: { id: source_id, status: 'Approved' },
                    include: [{
                        model: db.SMrpDetail,
                        as: 'details',
                        include: [{
                            model: SParts,
                            as: 'part',
                            attributes: ['id', 'part_number', 'part_name', 'price', 'weight'],
                            include: [
                                { model: db.SUom, as: 'uom', attributes: ['id', 'name', 'code'] },
                                // [M2M] Ambil semua supplier yang bisa handle part ini
                                // via tabel junction s_part_suppliers (as: 'suppliers')
                                {
                                    model: SSuppliers,
                                    as: 'suppliers',
                                    attributes: ['id', 'supplier_code', 'name'],
                                    through: {
                                        model: db.SPartSuppliers,
                                        attributes: ['is_primary']
                                    }
                                }
                            ]
                        }]
                    }]
                });

                if (!mrp) return { status: false, message: 'MRP not found or not approved', code: 404 };

                // Kumpulkan SISA qty per part_id yang sudah ada di MPO aktif untuk source MRP ini.
                // FIX v3: sama seperti cabang MPR di atas — SUM qty per part, bukan binary ada/tidak.
                const usedQtyRows = await TMaterialPurchaseOrderDetail.findAll({
                    attributes: ['part_id', 'qty'],
                    include: [{
                        model: SMaterialPurchaseOrder,
                        as: 'purchase_order',
                        attributes: [],
                        where: {
                            mrp_id: mrp.id,
                            deleted_at: null,
                            status: { [Op.in]: ['draft', 'submitted', 'approved'] }
                        },
                        required: true
                    }],
                    raw: true
                });
                const usedQtyByPart = new Map();
                for (const row of usedQtyRows) {
                    usedQtyByPart.set(row.part_id, (usedQtyByPart.get(row.part_id) || 0) + Number(row.qty));
                }

                const availableDetails = (mrp.details || [])
                    .map(d => {
                        const remainingQty = Number(d.qty) - (usedQtyByPart.get(d.part_id) || 0);
                        return { ...d.toJSON ? d.toJSON() : d, remainingQty };
                    })
                    .filter(d => d.remainingQty > 0);

                return {
                    status: true,
                    data: {
                        source_type: 'mrp',
                        source_id: mrp.id,
                        source_number: mrp.number,
                        details: availableDetails.map(d => ({
                            part_id: d.part_id,
                            qty: d.remainingQty, // sisa qty yang benar-benar masih bisa di-generate
                            notes: d.notes,
                            part: d.part
                        }))
                    }
                };
            }
        } catch (error) {
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // LIST
    // ============================================================

    async list(req) {
        try {
            const params = req.query;
            const { start_date, end_date, status, search } = params;
            const { limit, page, offset } = helper.getPagination(params);

            const where = {};

            if (start_date && end_date) {
                where.po_date = { [Op.between]: [start_date, end_date] };
            }
            if (status) where.status = status;
            if (search) {
                where[Op.or] = [
                    { number: { [Op.like]: `%${search}%` } },
                    { description: { [Op.like]: `%${search}%` } }
                ];
            }

            const include = [
                {
                    model: SSuppliers,
                    as: 'supplier',
                    attributes: ['id', 'name', 'supplier_code']
                },
                {
                    model: SWarehouses,
                    as: 'warehouse',
                    attributes: ['id', 'name']
                },
                {
                    model: SMaterialPurchaseRequest,
                    as: 'purchase_request',
                    attributes: ['id', 'number', 'description', 'type', 'request_date'],
                    required: false
                },
                {
                    model: db.SMrp,
                    as: 'mrp',
                    attributes: ['id', 'number', 'description'],
                    required: false
                }
            ];

            const { count, rows } = await SMaterialPurchaseOrder.findAndCountAll({
                where,
                include,
                limit,
                offset,
                order: [['created_at', 'DESC']]
            });

            return {
                status: true,
                data: helper.getPaginationData(rows, count, page, limit)
            };
        } catch (error) {
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // DETAIL
    // ============================================================

    async detail(req) {
        try {
            const { id } = req.params;

            const mpo = await SMaterialPurchaseOrder.findByPk(id, {
                include: [
                    {
                        model: SSuppliers,
                        as: 'supplier',
                        attributes: ['id', 'name', 'supplier_code']
                    },
                    {
                        model: SWarehouses,
                        as: 'warehouse',
                        attributes: ['id', 'name']
                    },
                    {
                        model: SMaterialPurchaseRequest,
                        as: 'purchase_request',
                        attributes: ['id', 'number', 'description', 'request_date'],
                        required: false
                    },
                    {
                        model: db.SMrp,
                        as: 'mrp',
                        attributes: ['id', 'number', 'description'],
                        required: false
                    },
                    {
                        model: TMaterialPurchaseOrderDetail,
                        as: 'details',
                        include: [{
                            model: SParts,
                            as: 'part',
                            attributes: ['id', 'part_number', 'part_name', 'weight'],
                            include: [{ model: db.SUom, as: 'uom', attributes: ['id', 'name', 'code'] }]
                        }]
                    },
                    {
                        model: SUsers,
                        as: 'creator',
                        attributes: ['id', 'email'],
                        required: false,
                        include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
                    },
                    {
                        model: SUsers,
                        as: 'approver',
                        attributes: ['id', 'email'],
                        required: false,
                        include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
                    },
                    {
                        model: SMaterialPurchaseOrderLog,
                        as: 'logs',
                        attributes: ['id', 'action', 'status', 'notes', 'user_id', 'created_at'],
                        include: [
                            {
                                model: SUsers,
                                as: 'user',
                                attributes: ['id', 'email'],
                                required: false,
                                include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
                            }
                        ],
                        order: [['created_at', 'ASC']]
                    }
                ]
            });

            if (!mpo) return { status: false, message: 'Purchase Order not found', code: 404 };

            return { status: true, data: mpo };
        } catch (error) {
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // CREATE
    // ============================================================

    async create(req) {
        const t = await db.sequelize.transaction();
        try {
            const data = req.body;
            const currentUser = req.user;

            // Validasi & ekstrak details SEBELUM helper.validate agar tidak
            // di-strip oleh Joi stripUnknown yang dipakai helper.validate.
            const detailItemSchema = Joi.object({
                part_id: Joi.number().integer().required(),
                qty: Joi.number().min(0.0001).required(),
                price: Joi.number().min(0).optional().allow(null),
                notes: Joi.string().optional().allow('', null)
            });
            const detailsValidation = Joi.array().items(detailItemSchema).min(1).required()
                .validate(data.details, { abortEarly: false });
            if (detailsValidation.error) {
                await t.rollback();
                return { status: false, message: detailsValidation.error.details.map(d => d.message).join(', '), code: 400 };
            }
            const details = detailsValidation.value;

            // Validasi field header (tanpa details agar helper.validate tidak menolaknya)
            const { details: _stripped, ...headerData } = data;
            const schema = Joi.object({
                source_type: Joi.string().valid('mpr', 'mrp').required(),
                source_id: Joi.number().integer().required(),
                supplier_id: Joi.number().integer().required(),
                warehouse_id: Joi.number().integer().optional().allow(null),
                description: Joi.string().optional().allow('', null),
                po_date: Joi.date().iso().min('now').required(),
                payment_term: Joi.string().optional().allow('', null),
                remarks: Joi.string().optional().allow('', null),
                action: Joi.string().valid('draft', 'submit').default('draft')
            });

            const validation = helper.validate(headerData, schema);
            if (!validation.status) {
                await t.rollback();
                return validation;
            }

            const { source_type, source_id, supplier_id, description, po_date, payment_term, remarks, action } = validation.value;

            // Auto-resolve warehouse_id: pakai yang dikirim frontend, atau cari gudang
            // yang namanya mengandung kata 'Material', atau fallback ke ID 1.
            let warehouse_id = validation.value.warehouse_id ?? null;
            if (!warehouse_id) {
                const materialWarehouse = await SWarehouses.findOne({
                    where: { name: { [Op.like]: '%Material%' } },
                    order: [['id', 'ASC']],
                    transaction: t
                });
                warehouse_id = materialWarehouse ? materialWarehouse.id : 1;
            }

            // Validasi source — pastikan dokumen ada dan belum dipakai MPO aktif
            let sourceRecord = null;
            let sourceNumber = '';

            if (source_type === 'mpr') {
                sourceRecord = await SMaterialPurchaseRequest.findOne({
                    where: { id: source_id, status: 'approved' },
                    include: [{ model: TMaterialPurchaseRequestDetail, as: 'details', attributes: ['part_id', 'qty'] }],
                    transaction: t
                });
                if (!sourceRecord) {
                    await t.rollback();
                    return { status: false, message: 'Purchase Request not found or not approved', code: 404 };
                }
                sourceNumber = sourceRecord.number;
            } else {
                sourceRecord = await db.SMrp.findOne({
                    where: { id: source_id, status: 'Approved' },
                    include: [{ model: db.SMrpDetail, as: 'details', attributes: ['part_id', 'qty'] }],
                    transaction: t
                });
                if (!sourceRecord) {
                    await t.rollback();
                    return { status: false, message: 'MRP not found or not approved', code: 404 };
                }
                sourceNumber = sourceRecord.number;
            }

            // Pastikan semua part_id yang dikirim memang ada di source
            const sourcePartIds = new Set((sourceRecord.details || []).map(d => d.part_id));
            const invalidParts = details.filter(d => !sourcePartIds.has(d.part_id));
            if (invalidParts.length > 0) {
                await t.rollback();
                return { status: false, message: `Part ID [${invalidParts.map(d => d.part_id).join(', ')}] not found in source document`, code: 400 };
            }

            // Pastikan tidak ada part yang qty-nya OVER-ALLOCATE dari sisa yang tersedia.
            // FIX v3: dulu binary (part_id ada di MPO aktif -> tolak total). Itu salah untuk
            // split-per-supplier: part qty 8 bisa terbagi MPO A (qty 5) + MPO B (qty 3). Part
            // itu masih "ada" di MPO aktif (B), tapi sisa qty 5-nya (kalau A sudah dihapus)
            // tetap valid untuk di-generate ulang. Sekarang dicek per-qty, bukan per-part_id.
            const mpoWhere = source_type === 'mpr' ? { mpr_id: source_id } : { mrp_id: source_id };
            const usedQtyRows = await TMaterialPurchaseOrderDetail.findAll({
                attributes: ['part_id', 'qty'],
                include: [{
                    model: SMaterialPurchaseOrder,
                    as: 'purchase_order',
                    attributes: [],
                    where: { ...mpoWhere, deleted_at: null, status: { [Op.in]: ['draft', 'submitted', 'approved'] } },
                    required: true
                }],
                transaction: t,
                raw: true
            });
            const usedQtyByPartId = new Map();
            for (const r of usedQtyRows) {
                usedQtyByPartId.set(r.part_id, (usedQtyByPartId.get(r.part_id) || 0) + Number(r.qty));
            }
            const originalQtyByPartId = new Map((sourceRecord.details || []).map(d => [d.part_id, Number(d.qty)]));

            const overAllocatedParts = details.filter(d => {
                const originalQty = originalQtyByPartId.get(d.part_id) || 0;
                const usedQty = usedQtyByPartId.get(d.part_id) || 0;
                const remainingQty = originalQty - usedQty;
                return Number(d.qty) > remainingQty;
            });
            if (overAllocatedParts.length > 0) {
                await t.rollback();
                return {
                    status: false,
                    message: `Part ID [${overAllocatedParts.map(d => d.part_id).join(', ')}] requested qty exceeds the remaining available qty in this source`,
                    code: 400
                };
            }

            const status = action === 'submit' ? 'submitted' : 'draft';
            const number = await this._generateMpoNumber(t);

            const mpo = await SMaterialPurchaseOrder.create({
                mpr_id: source_type === 'mpr' ? source_id : null,
                mrp_id: source_type === 'mrp' ? source_id : null,
                supplier_id,
                warehouse_id,
                number,
                description,
                po_date,
                payment_term,
                status,
                remarks,
                created_by: currentUser.id,
                approved_by: null
            }, { transaction: t });

            // Pakai detail dari frontend (hanya part yang dipilih user dari keranjang)
            const detailData = details.map(item => ({
                mpo_id: mpo.id,
                part_id: item.part_id,
                qty: item.qty,
                price: item.price ?? null,
                notes: item.notes || null
            }));
            await TMaterialPurchaseOrderDetail.bulkCreate(detailData, { transaction: t });

            await this._logAction(mpo.id, 'created', null, t, currentUser.id, 'draft');
            if (status === 'submitted') {
                await this._logAction(mpo.id, 'submitted', null, t, currentUser.id, 'submitted');
            }

            await this.logActivity(req, {
                moduleCode: 'material',
                activityCode: 'CREATE_MPO',
                resourceId: mpo.id,
                newData: mpo,
                description: `Created MPO ${number} from ${source_type.toUpperCase()} ${sourceNumber}`,
                transaction: t
            });

            await t.commit();
            return {
                status: true,
                message: `Purchase Order ${status === 'submitted' ? 'submitted' : 'saved as draft'} successfully`,
                data: mpo
            };
        } catch (error) {
            await t.rollback();
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // UPDATE
    // ============================================================

    async update(req) {
        const t = await db.sequelize.transaction();
        try {
            const { id } = req.params;
            const data = req.body;

            const mpo = await SMaterialPurchaseOrder.findByPk(id, { transaction: t });
            if (!mpo) {
                await t.rollback();
                return { status: false, message: 'Purchase Order not found', code: 404 };
            }

            if (!['draft', 'rejected'].includes(mpo.status)) {
                await t.rollback();
                return { status: false, message: 'Purchase Order can only be edited when in draft or rejected status', code: 400 };
            }

            const schema = Joi.object({
                supplier_id: Joi.number().integer().optional(),
                warehouse_id: Joi.number().integer().optional(),
                description: Joi.string().optional().allow('', null),
                po_date: Joi.date().iso().optional(),
                payment_term: Joi.string().optional().allow('', null),
                remarks: Joi.string().optional().allow('', null),
                action: Joi.string().valid('draft', 'submit').default('draft')
            });

            const validation = helper.validate(data, schema);
            if (!validation.status) {
                await t.rollback();
                return validation;
            }

            // Hanya tolak kalau po_date benar-benar DIUBAH ke tanggal masa lalu.
            if (
                validation.value.po_date &&
                new Date(validation.value.po_date).toISOString().slice(0, 10) !== new Date(mpo.po_date).toISOString().slice(0, 10)
            ) {
                const newDate = new Date(validation.value.po_date);
                const today = new Date();
                newDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);
                if (newDate < today) {
                    await t.rollback();
                    return { status: false, message: 'PO Date cannot be set to a past date', code: 400 };
                }
            }

            const { action, ...updates } = validation.value;
            const prevStatus = mpo.status;
            const newStatus = action === 'submit' ? 'submitted' : 'draft';
            const oldData = JSON.parse(JSON.stringify(mpo));

            await mpo.update({ ...updates, status: newStatus }, { transaction: t });

            if (newStatus === 'submitted' && prevStatus !== 'submitted') {
                await this._logAction(mpo.id, 'submitted', null, t, req.user.id, 'submitted');
            }

            await this.logActivity(req, {
                moduleCode: 'material',
                activityCode: 'UPDATE_MPO',
                resourceId: mpo.id,
                oldData,
                newData: mpo,
                description: `Updated MPO ${mpo.number}`,
                transaction: t
            });

            await t.commit();
            return {
                status: true,
                message: `Purchase Order ${newStatus === 'submitted' ? 'submitted' : 'saved as draft'} successfully`
            };
        } catch (error) {
            await t.rollback();
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // UPDATE STATUS
    // ============================================================

    async updateStatus(req) {
        const t = await db.sequelize.transaction();
        try {
            const { id } = req.params;
            const { action, notes } = req.body;
            const currentUser = req.user;

            if (!['approve', 'reject'].includes(action)) {
                await t.rollback();
                return { status: false, message: 'Action must be approve or reject', code: 400 };
            }

            const mpo = await SMaterialPurchaseOrder.findByPk(id, { transaction: t });
            if (!mpo) {
                await t.rollback();
                return { status: false, message: 'Purchase Order not found', code: 404 };
            }

            if (mpo.status !== 'submitted') {
                await t.rollback();
                return { status: false, message: 'Only submitted Purchase Orders can be approved or rejected', code: 400 };
            }

            if (action === 'reject' && !notes) {
                await t.rollback();
                return { status: false, message: 'Rejection reason (notes) is required', code: 400 };
            }

            const newStatus = action === 'approve' ? 'approved' : 'rejected';
            const oldData = JSON.parse(JSON.stringify(mpo));

            await mpo.update({
                status: newStatus,
                approved_by: action === 'approve' ? currentUser.id : mpo.approved_by
            }, { transaction: t });

            await this._logAction(mpo.id, newStatus, notes || null, t, currentUser.id, newStatus);

            await this.logActivity(req, {
                moduleCode: 'material',
                activityCode: 'UPDATE_MPO_STATUS',
                resourceId: mpo.id,
                oldData,
                newData: mpo,
                description: `MPO ${mpo.number} ${newStatus}${notes ? ` — ${notes}` : ''}`,
                transaction: t
            });

            await t.commit();
            return {
                status: true,
                message: action === 'approve'
                    ? 'Purchase Order approved successfully'
                    : 'Purchase Order rejected'
            };
        } catch (error) {
            await t.rollback();
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // DELETE
    // ============================================================

    async delete(req) {
        const t = await db.sequelize.transaction();
        try {
            const { id } = req.params;

            const mpo = await SMaterialPurchaseOrder.findByPk(id, { transaction: t });
            if (!mpo) {
                await t.rollback();
                return { status: false, message: 'Purchase Order not found', code: 404 };
            }

            if (mpo.status !== 'draft') {
                await t.rollback();
                return { status: false, message: 'Only draft Purchase Orders can be deleted', code: 400 };
            }

            const oldData = JSON.parse(JSON.stringify(mpo));
            await mpo.destroy({ transaction: t });

            await this.logActivity(req, {
                moduleCode: 'material',
                activityCode: 'DELETE_MPO',
                resourceId: id,
                oldData,
                description: `Deleted MPO ${mpo.number}`,
                transaction: t
            });

            await t.commit();
            return { status: true, message: 'Purchase Order deleted successfully' };
        } catch (error) {
            await t.rollback();
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // MDO HISTORY
    // ============================================================

    async getMdoHistory(req) {
        try {
            const { id } = req.params;

            const mpo = await SMaterialPurchaseOrder.findByPk(id, {
                include: [{
                    association: 'material_delivery_orders',
                    order: [['created_at', 'DESC']]
                }]
            });

            if (!mpo) return { status: false, message: 'Purchase Order not found', code: 404 };

            return { status: true, data: mpo.material_delivery_orders };
        } catch (error) {
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    async splitUpdate(req) {
        const t = await db.sequelize.transaction();
        try {
            const { id } = req.params;
            const data = req.body;
            const currentUser = req.user;

            // ── 1. Validasi payload ─────────────────────────────────────────────
            const itemSchema = Joi.object({
                part_id: Joi.number().integer().required(),
                qty: Joi.number().min(0.0001).required(),
                price: Joi.number().min(0).optional().allow(null),
                notes: Joi.string().optional().allow('', null),
                supplier_id: Joi.number().integer().required()
            });

            const headerSchema = Joi.object({
                po_date: Joi.date().iso().optional(),
                payment_term: Joi.string().optional().allow('', null),
                description: Joi.string().optional().allow('', null),
                remarks: Joi.string().optional().allow('', null),
                action: Joi.string().valid('draft', 'submit').default('draft')
            });

            const itemsValidation = Joi.array().items(itemSchema).min(1).required()
                .validate(data.items, { abortEarly: false });
            if (itemsValidation.error) {
                await t.rollback();
                return { status: false, message: itemsValidation.error.details.map(d => d.message).join(', '), code: 400 };
            }
            const items = itemsValidation.value;

            const { items: _stripped, ...headerData } = data;
            const headerValidation = helper.validate(headerData, headerSchema);
            if (!headerValidation.status) {
                await t.rollback();
                return headerValidation;
            }

            
            const { action, ...headerUpdates } = headerValidation.value;
            const newStatus = action === 'submit' ? 'submitted' : 'draft';

            // ── 2. Load MPO asal ────────────────────────────────────────────────
            const mpo = await SMaterialPurchaseOrder.findByPk(id, {
                include: [{ model: TMaterialPurchaseOrderDetail, as: 'details' }],
                transaction: t
            });
            if (!mpo) {
                await t.rollback();
                return { status: false, message: 'Purchase Order not found', code: 404 };
            }
            if (!['draft', 'rejected'].includes(mpo.status)) {
                await t.rollback();
                return { status: false, message: 'Only MPOs with Draft or Rejected status can be split-updated', code: 400 };
            }

            // ── 3. Validasi kelengkapan part ────────────────────────────────────
            // Semua part dari detail original harus ada di payload
            const originalDetails = mpo.details || [];
            const originalQtyMap = new Map(); // part_id → qty original
            for (const d of originalDetails) {
                originalQtyMap.set(d.part_id, Number(d.qty));
            }
            // Hanya tolak kalau po_date benar-benar DIUBAH ke tanggal masa lalu.
            if (
                headerValidation.value.po_date &&
                new Date(headerValidation.value.po_date).toISOString().slice(0, 10) !== new Date(mpo.po_date).toISOString().slice(0, 10)
            ) {
                const newDate = new Date(headerValidation.value.po_date);
                const today = new Date();
                newDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);
                if (newDate < today) {
                    await t.rollback();
                    return { status: false, message: 'PO Date cannot be set to a past date', code: 400 };
                }
            }


            // Hitung total qty per part di payload
            const payloadQtyMap = new Map(); // part_id → total qty di payload
            for (const item of items) {
                const prev = payloadQtyMap.get(item.part_id) || 0;
                payloadQtyMap.set(item.part_id, prev + Number(item.qty));
            }

            // Cek: semua part original harus hadir
            for (const [partId, origQty] of originalQtyMap.entries()) {
                if (!payloadQtyMap.has(partId)) {
                    await t.rollback();
                    return { status: false, message: `Part ID ${partId} not found in payload. All original parts are required.`, code: 400 };
                }
                const payloadTotal = payloadQtyMap.get(partId);
                if (Math.abs(payloadTotal - origQty) > 0.0001) {
                    await t.rollback();
                    return {
                        status: false,
                        message: `Part ID ${partId}: total payload qty (${payloadTotal}) does not match the original qty (${origQty})`,
                        code: 400
                    };
                }
            }

            // Cek: tidak ada part asing di payload yang tidak ada di original
            for (const partId of payloadQtyMap.keys()) {
                if (!originalQtyMap.has(partId)) {
                    await t.rollback();
                    return { status: false, message: `Part ID ${partId} not found in original MPO detail`, code: 400 };
                }
            }

            // ── 4. Kelompokkan items berdasarkan supplier_id ─────────────────────
            // Supplier yang sama dengan MPO asal → tetap di MPO asal
            // Supplier berbeda → MPO baru
            const originalSupplierId = mpo.supplier_id;

            const groupsForOriginal = []; // items yang tetap di MPO asal
            const newSupplierGroups = {}; // supplier_id → items[]

            for (const item of items) {
                if (item.supplier_id === originalSupplierId) {
                    groupsForOriginal.push(item);
                } else {
                    if (!newSupplierGroups[item.supplier_id]) {
                        newSupplierGroups[item.supplier_id] = [];
                    }
                    newSupplierGroups[item.supplier_id].push(item);
                }
            }

            const oldData = JSON.parse(JSON.stringify(mpo));
            const generatedMpos = [];

            // ── 5. Update MPO asal ─────────────────────────────────────────────
            if (groupsForOriginal.length > 0) {
                // Update header MPO asal
                await mpo.update({
                    ...headerUpdates,
                    status: newStatus,
                    approved_by: null  // reset approver karena sedang di-resubmit
                }, { transaction: t });

                // Replace details MPO asal — hapus semua detail lama, insert yang baru
                await TMaterialPurchaseOrderDetail.destroy({
                    where: { mpo_id: mpo.id },
                    transaction: t,
                    force: false  // soft-delete (paranoid)
                });
                await TMaterialPurchaseOrderDetail.bulkCreate(
                    groupsForOriginal.map(item => ({
                        mpo_id: mpo.id,
                        part_id: item.part_id,
                        qty: item.qty,
                        price: item.price ?? null,
                        notes: item.notes || null
                    })),
                    { transaction: t }
                );

                await this._logAction(mpo.id, 'edited_after_rejection', null, t, currentUser.id, newStatus);
                if (newStatus === 'submitted') {
                    await this._logAction(mpo.id, 'submitted', null, t, currentUser.id, 'submitted');
                }
            } else {
                // Tidak ada item yang tersisa untuk supplier original → soft-delete MPO asal
                await TMaterialPurchaseOrderDetail.destroy({
                    where: { mpo_id: mpo.id },
                    transaction: t,
                    force: false
                });
                await mpo.destroy({ transaction: t }); // soft-delete
                await this._logAction(mpo.id, 'auto_deleted_after_split', `Semua part dipindah ke supplier lain`, t, currentUser.id, 'deleted');
            }

            // ── 6. Buat MPO baru untuk setiap supplier berbeda ─────────────────
            for (const [suppId, groupItems] of Object.entries(newSupplierGroups)) {
                const number = await this._generateMpoNumber(t);

                const newMpo = await SMaterialPurchaseOrder.create({
                    mpr_id: mpo.mpr_id,   // Wariskan referensi source dari MPO asal
                    mrp_id: mpo.mrp_id,
                    supplier_id: parseInt(suppId),
                    warehouse_id: mpo.warehouse_id,
                    number,
                    description: headerUpdates.description ?? mpo.description,
                    po_date: headerUpdates.po_date ?? mpo.po_date,
                    payment_term: headerUpdates.payment_term ?? mpo.payment_term,
                    status: newStatus,
                    remarks: headerUpdates.remarks ?? null,
                    created_by: currentUser.id,
                    approved_by: null
                }, { transaction: t });

                await TMaterialPurchaseOrderDetail.bulkCreate(
                    groupItems.map(item => ({
                        mpo_id: newMpo.id,
                        part_id: item.part_id,
                        qty: item.qty,
                        price: item.price ?? null,
                        notes: item.notes || null
                    })),
                    { transaction: t }
                );

                await this._logAction(newMpo.id, 'created', `Split dari MPO ${mpo.number}`, t, currentUser.id, 'draft');
                if (newStatus === 'submitted') {
                    await this._logAction(newMpo.id, 'submitted', null, t, currentUser.id, 'submitted');
                }

                generatedMpos.push(newMpo.number);
            }

            await this.logActivity(req, {
                moduleCode: 'material',
                activityCode: 'SPLIT_UPDATE_MPO',
                resourceId: id,
                oldData,
                description: `Split-update MPO ${mpo.number}. ${generatedMpos.length > 0 ? 'New MPO: ' + generatedMpos.join(', ') : 'No new MPO.'}`,
                transaction: t
            });

            await t.commit();
            return {
                status: true,
                message: `MPO updated successfully${generatedMpos.length > 0 ? `. ${generatedMpos.length} new MPO created: ${generatedMpos.join(', ')}` : ''}`,
                data: {
                    original_mpo_id: id,
                    new_mpo_numbers: generatedMpos
                }
            };
        } catch (error) {
            await t.rollback();
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // BULK SUBMIT (Draft -> Submitted)
    // ============================================================
    async bulkSubmit(req) {
        const t = await db.sequelize.transaction();
        try {
            const { ids } = req.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                await t.rollback();
                return { status: false, message: 'IDs are required and cannot be empty', code: 400 };
            }

            const parsedIds = ids.map(Number).filter(id => !isNaN(id));
            if (parsedIds.length === 0) {
                await t.rollback();
                return { status: false, message: 'Invalid IDs', code: 400 };
            }

            // Ambil semua MPO yang diminta, pastikan statusnya draft
            const mpos = await SMaterialPurchaseOrder.findAll({
                where: { id: { [Op.in]: parsedIds }, status: 'draft' },
                transaction: t
            });

            if (mpos.length === 0) {
                await t.rollback();
                return { status: false, message: 'No MPO with Draft status found from the given IDs', code: 404 };
            }

            const foundIds = mpos.map(m => m.id);

            await SMaterialPurchaseOrder.update(
                { status: 'submitted' },
                { where: { id: { [Op.in]: foundIds } }, transaction: t }
            );

            for (const mpo of mpos) {
                await this._logAction(mpo.id, 'submitted', null, t, req.user.id, 'submitted');
            }

            await this.logActivity(req, {
                moduleCode: 'material',
                activityCode: 'BULK_SUBMIT_MPO',
                resourceId: foundIds.join(','),
                description: `Bulk submitted ${foundIds.length} MPO(s): ${mpos.map(m => m.number).join(', ')}`,
                transaction: t
            });

            await t.commit();

            const notProcessed = parsedIds.filter(id => !foundIds.includes(id));

            return {
                status: true,
                message: `${foundIds.length} MPO submitted successfully`,
                data: {
                    processed: foundIds,
                    not_processed: notProcessed,
                    reason_not_processed: notProcessed.length > 0 ? 'MPO not found or status is not Draft' : null
                }
            };
        } catch (error) {
            await t.rollback();
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // BULK REVIEW (Submitted -> Approved / Rejected)
    // ============================================================
    // PUT /bulk-review
    // Supervisor approve/reject BANYAK MPO sekaligus (via checkbox)
    // Body: { ids: [1,2,3], action: 'approve'|'reject', notes: '...' }
    // Aktor: Supervisor Material / Superadmin (APPROVER)
    async bulkReview(req) {
        const t = await db.sequelize.transaction();
        try {
            const { ids, action, notes } = req.body;
            const currentUser = req.user;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                await t.rollback();
                return { status: false, message: 'IDs are required and cannot be empty', code: 400 };
            }

            const parsedIds = ids.map(Number).filter(id => !isNaN(id));
            if (parsedIds.length === 0) {
                await t.rollback();
                return { status: false, message: 'Invalid IDs', code: 400 };
            }

            if (!action || !['approve', 'reject'].includes(action)) {
                await t.rollback();
                return { status: false, message: "Action must be 'approve' or 'reject'", code: 400 };
            }

            if (action === 'reject' && !notes) {
                await t.rollback();
                return { status: false, message: 'Rejection reason (notes) is required when rejecting', code: 400 };
            }

            // Ambil semua MPO yang diminta, pastikan statusnya submitted
            const mpos = await SMaterialPurchaseOrder.findAll({
                where: { id: { [Op.in]: parsedIds }, status: 'submitted' },
                transaction: t
            });

            if (mpos.length === 0) {
                await t.rollback();
                return { status: false, message: 'No MPO with Submitted status found from the given IDs', code: 404 };
            }

            const newStatus = action === 'approve' ? 'approved' : 'rejected';
            const foundIds = mpos.map(m => m.id);

            // Catatan: MPO yang lolos filter di atas pasti berstatus 'submitted',
            // artinya belum pernah di-approve sebelumnya (approved_by masih null).
            // Jadi untuk reject, set null aman & konsisten dgn updateStatus single-item.
            await SMaterialPurchaseOrder.update(
                {
                    status: newStatus,
                    approved_by: action === 'approve' ? currentUser.id : null
                },
                { where: { id: { [Op.in]: foundIds } }, transaction: t }
            );

            for (const mpo of mpos) {
                await this._logAction(mpo.id, newStatus, notes || null, t, currentUser.id, newStatus);
            }

            await this.logActivity(req, {
                moduleCode: 'material',
                activityCode: 'BULK_REVIEW_MPO',
                resourceId: foundIds.join(','),
                description: `Bulk ${newStatus} ${foundIds.length} MPO(s): ${mpos.map(m => m.number).join(', ')}${notes ? ` — ${notes}` : ''}`,
                transaction: t
            });

            await t.commit();

            const notProcessed = parsedIds.filter(id => !foundIds.includes(id));

            return {
                status: true,
                message: `${foundIds.length} MPO successfully ${newStatus}`,
                data: {
                    processed: foundIds,
                    not_processed: notProcessed,
                    reason_not_processed: notProcessed.length > 0 ? 'MPO not found or status is not Submitted' : null
                }
            };
        } catch (error) {
            await t.rollback();
            if (config.debug) return { status: false, error: error.message, code: 500 };
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    // ============================================================
    // AUTO-GENERATE MPO
    // ============================================================
    async autoGenerate(req) {
        const t = await db.sequelize.transaction();
        try {
            const data = req.body;
            const currentUser = req.user;

            const schema = Joi.object({
                isAutoGenerate: Joi.boolean().optional(),
                source_type: Joi.string().valid('mpr', 'mrp').required(),
                source_id: Joi.number().integer().required(),
                warehouse_id: Joi.number().integer().optional().allow(null),
                description: Joi.string().optional().allow('', null),
                po_date: Joi.date().iso().min('now').required(),
                payment_term: Joi.string().optional().allow('', null),
                remarks: Joi.string().optional().allow('', null),
                action: Joi.string().valid('draft', 'submit').default('draft'),
                // TAMBAHAN BARU: Backend menerima list item & pilihan suppliernya
                items: Joi.array().items(Joi.object({
                    part_id: Joi.number().integer().required(),
                    qty: Joi.number().required(),
                    price: Joi.number().optional().allow(null),
                    notes: Joi.string().optional().allow('', null),
                    supplier_id: Joi.number().integer().required()
                })).min(1).required()
            });

            const validation = helper.validate(data, schema);
            if (!validation.status) {
                await t.rollback();
                return validation;
            }

            const { source_type, source_id, warehouse_id, description, po_date, payment_term, remarks, action, items } = validation.value;

            // 1. Auto-resolve warehouse_id
            let finalWarehouseId = warehouse_id;
            if (!finalWarehouseId) {
                const materialWarehouse = await SWarehouses.findOne({
                    where: { name: { [Op.like]: '%Material%' } },
                    order: [['id', 'ASC']],
                    transaction: t
                });
                finalWarehouseId = materialWarehouse ? materialWarehouse.id : 1;
            }

            // 2. Hitung SISA qty per part_id terhadap MPO aktif yang sudah ada (anti over-order).
            // FIX v3: dulu binary (part_id ada di MPO aktif -> skip total). Itu salah untuk
            // split-per-supplier: part qty 8 bisa terbagi MPO A (qty 5) + MPO B (qty 3). Kalau
            // user mau generate part itu lagi (misal sisa qty 5 sudah dibebaskan karena MPO A
            // dihapus), binary check lama akan skip part itu sepenuhnya walau sisa qty-nya valid.
            const mpoWhere = source_type === 'mpr' ? { mpr_id: source_id } : { mrp_id: source_id };
            const usedQtyByPartId = await TMaterialPurchaseOrderDetail.findAll({
                attributes: ['part_id', 'qty'],
                include: [{
                    model: SMaterialPurchaseOrder,
                    as: 'purchase_order',
                    attributes: [],
                    where: { ...mpoWhere, deleted_at: null, status: { [Op.in]: ['draft', 'submitted', 'approved'] } },
                    required: true
                }],
                transaction: t,
                raw: true
            }).then(rows => {
                const map = new Map();
                for (const r of rows) map.set(r.part_id, (map.get(r.part_id) || 0) + Number(r.qty));
                return map;
            });

            // Ambil qty ASLI per part_id dari source, lewat association 'details' yang sama
            // dengan yang sudah dipakai getSourceData/getDropdownSource — bukan query langsung
            // ke tabel detail, karena nama foreign key di model TMaterialPurchaseRequestDetail/
            // SMrpDetail belum terverifikasi dari file model yang ada.
            let sourceWithDetails;
            if (source_type === 'mpr') {
                sourceWithDetails = await SMaterialPurchaseRequest.findOne({
                    where: { id: source_id },
                    attributes: ['id'],
                    include: [{ model: TMaterialPurchaseRequestDetail, as: 'details', attributes: ['part_id', 'qty'] }],
                    transaction: t
                });
            } else {
                sourceWithDetails = await db.SMrp.findOne({
                    where: { id: source_id },
                    attributes: ['id'],
                    include: [{ model: db.SMrpDetail, as: 'details', attributes: ['part_id', 'qty'] }],
                    transaction: t
                });
            }
            const originalQtyByPartId = new Map(
                (sourceWithDetails?.details || []).map(d => [d.part_id, Number(d.qty)])
            );

            // 3. KELOMPOKKAN BERDASARKAN SUPPLIER PILIHAN USER (DARI FRONTEND)
            const supplierGroups = {};
            let totalProcessedParts = 0;

            for (const item of items) {
                const originalQty = originalQtyByPartId.get(item.part_id);
                if (originalQty === undefined) continue; // part tidak ada di source ini, abaikan

                const alreadyUsedQty = usedQtyByPartId.get(item.part_id) || 0;
                const remainingQty = originalQty - alreadyUsedQty;

                if (remainingQty <= 0) continue; // part ini sudah benar-benar habis terpakai

                // Anti over-order: kalau qty yang diminta user > sisa yang valid, clamp ke sisa.
                // Ini jaga-jaga kalau frontend kirim data stale (misal user tidak refresh source
                // setelah ada perubahan dari tab/sesi lain).
                if (Number(item.qty) > remainingQty) {
                    item.qty = remainingQty;
                }

                const suppId = item.supplier_id;
                if (!supplierGroups[suppId]) supplierGroups[suppId] = [];

                supplierGroups[suppId].push(item);
                totalProcessedParts++;
            }

            if (totalProcessedParts === 0) {
                await t.rollback();
                return { status: false, message: 'All materials have already been processed into MPO.', code: 400 };
            }

            // 4. GENERATE MPO UNTUK SETIAP SUPPLIER
            let sourceNumber = source_type === 'mpr' ? `MPR ID ${source_id}` : `MRP ID ${source_id}`; // Fallback string
            const status = action === 'submit' ? 'submitted' : 'draft';
            const generatedMpos = [];

            for (const [suppId, groupItems] of Object.entries(supplierGroups)) {
                const number = await this._generateMpoNumber(t);

                const mpo = await SMaterialPurchaseOrder.create({
                    mpr_id: source_type === 'mpr' ? source_id : null,
                    mrp_id: source_type === 'mrp' ? source_id : null,
                    supplier_id: parseInt(suppId),
                    warehouse_id: finalWarehouseId,
                    number,
                    description: description ? `${description} (Auto-Split)` : `Auto-Split from ${sourceNumber}`,
                    po_date,
                    payment_term,
                    status,
                    remarks,
                    created_by: currentUser.id,
                    approved_by: null
                }, { transaction: t });

                const detailData = groupItems.map(item => ({
                    mpo_id: mpo.id,
                    part_id: item.part_id,
                    qty: item.qty,
                    price: item.price,
                    notes: item.notes
                }));
                await TMaterialPurchaseOrderDetail.bulkCreate(detailData, { transaction: t });

                await this._logAction(mpo.id, 'created', null, t, currentUser.id, 'draft');
                if (status === 'submitted') await this._logAction(mpo.id, 'submitted', null, t, currentUser.id, 'submitted');

                generatedMpos.push(mpo.number);
            }

            await t.commit();
            return {
                status: true,
                message: `Successfully Auto-Generated ${generatedMpos.length} MPO document(s).`,
                data: { generated_mpo_numbers: generatedMpos }
            };
        } catch (error) {
            await t.rollback();
            console.error(error);
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

}

export default new MPOModule();