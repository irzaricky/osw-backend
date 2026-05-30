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

    async _logAction(mpo_id, action, notes = null, transaction = null) {
        await SMaterialPurchaseOrderLog.create(
            { mpo_id, action, notes },
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
     * Returns two lists: approved MPRs and approved MRPs not yet converted to PO
     */
    async getDropdownSource(req) {
        try {
            const [mprs, mrps] = await Promise.all([
                SMaterialPurchaseRequest.findAll({
                    where: {
                        status: 'approved'
                        // Tidak di-exclude meski sudah punya MPO — karena MPO sekarang
                        // bisa partial (hanya sebagian part). Source tetap muncul selama
                        // masih ada part yang belum di-MPO-kan (difilter di getSourceData).
                    },
                    attributes: ['id', 'number', 'description', 'request_date'],
                    order: [['number', 'ASC']]
                }),
                db.SMrp.findAll({
                    where: {
                        status: 'Approved'
                        // Sama — source tetap tampil di dropdown, part yang sudah
                        // di-MPO-kan akan di-exclude saat getSourceData dipanggil.
                    },
                    attributes: ['id', 'number', 'description'],
                    order: [['number', 'ASC']]
                })
            ]);

            // Flat array gabungan MRP + MPR untuk dropdown frontend
            const combined = [
                ...mrps.map(m => ({
                    label: m.number,
                    source_type: 'mrp',
                    source_id: m.id,
                    description: m.description
                })),
                ...mprs.map(m => ({
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
                // Coba ambil supplier via junction table s_part_suppliers
                let filtered = await SSuppliers.findAll({
                    where,
                    attributes: ['id', 'supplier_code', 'name', 'email'],
                    include: [{
                        model: db.SPartSuppliers,
                        as: 'part_suppliers',
                        attributes: ['part_id', 'is_primary'],
                        where: { part_id: { [Op.in]: parsedPartIds } },
                        required: true, // INNER JOIN — hanya supplier yang terdaftar
                    }],
                    order: [['name', 'ASC']],
                    limit: 50,
                });

                if (filtered.length > 0) {
                    // Normalisasi: hapus nested part_suppliers dari response
                    rows = filtered.map(s => {
                        const plain = s.toJSON();
                        delete plain.part_suppliers;
                        return plain;
                    });
                } else {
                    // FIX: fallback ke semua supplier jika junction table kosong untuk part ini
                    // Terjadi ketika s_part_suppliers belum di-seed atau part belum punya mapping
                    rows = await SSuppliers.findAll({
                        where,
                        attributes: ['id', 'supplier_code', 'name', 'email'],
                        order: [['name', 'ASC']],
                        limit: 50,
                    });
                }
            } else {
                // Tidak ada filter part — kembalikan semua supplier
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

                // Kumpulkan part_id yang sudah ada di MPO aktif (draft/submitted/approved)
                // untuk source MPR ini, agar tidak ditampilkan lagi ke user.
                const usedPartIds = await TMaterialPurchaseOrderDetail.findAll({
                    attributes: ['part_id'],
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
                }).then(rows => new Set(rows.map(r => r.part_id)));

                const availableDetails = (mpr.details || []).filter(d => !usedPartIds.has(d.part_id));

                return {
                    status: true,
                    data: {
                        source_type: 'mpr',
                        source_id: mpr.id,
                        source_number: mpr.number,
                        details: availableDetails.map(d => ({
                            part_id: d.part_id,
                            qty: d.qty,
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

                // Kumpulkan part_id yang sudah ada di MPO aktif untuk source MRP ini.
                const usedPartIds = await TMaterialPurchaseOrderDetail.findAll({
                    attributes: ['part_id'],
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
                }).then(rows => new Set(rows.map(r => r.part_id)));

                const availableDetails = (mrp.details || []).filter(d => !usedPartIds.has(d.part_id));

                return {
                    status: true,
                    data: {
                        source_type: 'mrp',
                        source_id: mrp.id,
                        source_number: mrp.number,
                        details: availableDetails.map(d => ({
                            part_id: d.part_id,
                            qty: d.qty,
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
                        as: 'logs'
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
                po_date: Joi.date().iso().required(),
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
                    include: [{ model: TMaterialPurchaseRequestDetail, as: 'details', attributes: ['part_id'] }],
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
                    include: [{ model: db.SMrpDetail, as: 'details', attributes: ['part_id'] }],
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
                return { status: false, message: `Part ID [${invalidParts.map(d => d.part_id).join(', ')}] tidak ditemukan di source document`, code: 400 };
            }

            // Pastikan tidak ada part yang sudah di-MPO-kan (aktif) dari source yang sama
            const mpoWhere = source_type === 'mpr' ? { mpr_id: source_id } : { mrp_id: source_id };
            const alreadyUsedPartIds = await TMaterialPurchaseOrderDetail.findAll({
                attributes: ['part_id'],
                include: [{
                    model: SMaterialPurchaseOrder,
                    as: 'purchase_order',
                    attributes: [],
                    where: { ...mpoWhere, deleted_at: null, status: { [Op.in]: ['draft', 'submitted', 'approved'] } },
                    required: true
                }],
                transaction: t,
                raw: true
            }).then(rows => new Set(rows.map(r => r.part_id)));

            const duplicateParts = details.filter(d => alreadyUsedPartIds.has(d.part_id));
            if (duplicateParts.length > 0) {
                await t.rollback();
                return { status: false, message: `Part ID [${duplicateParts.map(d => d.part_id).join(', ')}] sudah ada di MPO aktif lain`, code: 400 };
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

            await this._logAction(mpo.id, 'created', null, t);
            if (status === 'submitted') {
                await this._logAction(mpo.id, 'submitted', null, t);
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

            const { action, ...updates } = validation.value;
            const prevStatus = mpo.status;
            const newStatus = action === 'submit' ? 'submitted' : 'draft';
            const oldData = JSON.parse(JSON.stringify(mpo));

            await mpo.update({ ...updates, status: newStatus }, { transaction: t });

            if (newStatus === 'submitted' && prevStatus !== 'submitted') {
                await this._logAction(mpo.id, 'submitted', null, t);
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

            await this._logAction(mpo.id, newStatus, notes || null, t);

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

}

export default new MPOModule();