import { Op } from 'sequelize';
import db from '../../models/index.js';
import helper from '../../class/helper.class.js';

const {
  SMaterialPurchaseRequest,
  TMaterialPurchaseRequestDetail,
  SMaterialPurchaseRequestLog,
  SParts,
  SUsers,
  SUserDetail,
  SMrp,
  sequelize
} = db;

// ============================================================
// HELPER: Generate nomor PR → MPR-YYYY-MM-XXX
// ============================================================
const generateNumber = async (transaction) => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `MPR-${yyyy}-${mm}-`;

  const last = await SMaterialPurchaseRequest.findOne({
    where: { number: { [Op.like]: `${prefix}%` } },
    order: [['number', 'DESC']],
    paranoid: false,
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  let seq = 1;
  if (last) {
    const parts = last.number.split('-');
    seq = parseInt(parts[parts.length - 1]) + 1;
  }

  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ============================================================
// HELPER: Validasi dan upsert details PR
// ============================================================
const upsertDetails = async (mprId, details, transaction) => {
  // Hapus detail lama
  await TMaterialPurchaseRequestDetail.destroy({
    where: { mpr_id: mprId },
    transaction
  });

  if (!details || details.length === 0) return;

  const rows = details.map((d) => ({
    mpr_id: mprId,
    part_id: d.part_id,
    qty: d.qty,
    required_date: d.required_date || null,
    notes: d.notes || null
  }));

  await TMaterialPurchaseRequestDetail.bulkCreate(rows, { transaction });
};

// ============================================================
// INCLUDE config untuk query detail
// ============================================================
const detailInclude = [
  {
    model: TMaterialPurchaseRequestDetail,
    as: 'details',
    include: [
      {
        model: SParts,
        as: 'part',
        attributes: ['id', 'part_number', 'part_name', 'weight']
      }
    ]
  },
  {
    model: SUsers,
    as: 'creator',
    attributes: ['id', 'email']
  },
  {
    model: SUsers,
    as: 'approver',
    attributes: ['id', 'email']
  },
  {
    model: SMrp,
    as: 'mrp',
    attributes: ['id', 'number', 'description']
  },
  {
    model: SMaterialPurchaseRequestLog,
    as: 'logs',
    attributes: ['id', 'action', 'status', 'remarks', 'user_id', 'created_at'],
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
];

// ============================================================
// DROPDOWN: Status PR
// ============================================================
const getDropdownStatuses = async () => {
  return {
    status: true,
    data: [
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' }
    ]
  };
};

// ============================================================
// DROPDOWN: Parts untuk input detail PR
// ============================================================
const getDropdownParts = async (req) => {
  try {
    const { search } = req.query;
    const where = {};

    if (search) {
      where[Op.or] = [
        { part_number: { [Op.iLike]: `%${search}%` } },
        { part_name: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const parts = await SParts.findAll({
      where,
      attributes: ['id', 'part_number', 'part_name', 'weight'],
      order: [['part_number', 'ASC']],
      limit: 50
    });

    return {
      status: true,
      data: parts.map((p) => ({
        value: p.id,
        label: `${p.part_number} - ${p.part_name}`,
        weight: p.weight ?? null,
      }))
    };
  } catch (error) {
    console.error('getDropdownParts error:', error);
    return { status: false, error: 'Failed to retrieve parts data', code: 500 };
  }
};

// ============================================================
// LIST PR
// Query: ?search= ?status= ?type= ?page= ?limit=
// ============================================================
const list = async (req) => {
  try {
    const { search, status, type } = req.query;
    const { limit, page, offset } = helper.getPagination(req.query);

    const where = {};

    if (search) {
      where[Op.or] = [
        { number: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (status) where.status = status;
    if (type) where.type = type;

    const { rows, count } = await SMaterialPurchaseRequest.findAndCountAll({
      where,
      include: [
        { model: SUsers, as: 'creator', attributes: ['id', 'email'] },
        { model: SUsers, as: 'approver', attributes: ['id', 'email'] },
        { model: SMrp, as: 'mrp', attributes: ['id', 'number'] }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    return {
      status: true,
      data: helper.getPaginationData(rows, count, page, limit)
    };
  } catch (error) {
    console.error('list PR error:', error);
    return { status: false, error: 'Failed to retrieve PR data', code: 500 };
  }
};

// ============================================================
// DETAIL PR
// ============================================================
const detail = async (req) => {
  try {
    const { id } = req.params;

    const pr = await SMaterialPurchaseRequest.findByPk(id, {
      include: detailInclude
    });

    if (!pr) {
      return { status: false, error: 'Purchase Request not found', code: 404 };
    }

    return { status: true, data: pr };
  } catch (error) {
    console.error('detail PR error:', error);
    return { status: false, error: 'Failed to retrieve PR detail', code: 500 };
  }
};

// ============================================================
// CREATE EMERGENCY PR (manual, tanpa MRP)
// Body: { description, details[], save_as_draft }
// details[]: { part_id, qty, required_date?, notes? }
// ============================================================
const createEmergency = async (req) => {
  const transaction = await sequelize.transaction();
  try {
    const { description, details, save_as_draft = true } = req.body;
    const userId = req.user.id;

    // Validasi wajib
    const mandatory = helper.checkMandatory(req.body, ['description']);
    if (!mandatory.status) {
      await transaction.rollback();
      return mandatory;
    }

    if (!details || !Array.isArray(details) || details.length === 0) {
      await transaction.rollback();
      return { status: false, error: 'At least 1 detail item is required', code: 400 };
    }

    // Validasi tiap item detail
    for (const [i, d] of details.entries()) {
      if (!d.part_id) {
        await transaction.rollback();
        return { status: false, error: `Part must be selected for item ${i + 1}`, code: 400 };
      }
      if (!d.qty || Number(d.qty) <= 0) {
        await transaction.rollback();
        return { status: false, error: `Quantity must be greater than 0 for item ${i + 1}`, code: 400 };
      }
    }

    const now = new Date();
    // Definisi "periode" adalah bulan berjalan
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const inputPartIds = details.map(d => d.part_id);

    // Cari MPR aktif (draft / submitted) di periode yang sama
    const activeMprs = await SMaterialPurchaseRequest.findAll({
      where: {
        status: { [Op.in]: ['draft', 'submitted'] }, // Cek yang masih aktif
        request_date: { [Op.between]: [startOfMonth, endOfMonth] }
      },
      include: [{
        model: TMaterialPurchaseRequestDetail,
        as: 'details',
        where: { part_id: { [Op.in]: inputPartIds } }, // Cari apakah part_id ini ada di dalamnya
        attributes: ['part_id']
      }],
      transaction
    });

    // Jika ditemukan MPR aktif dengan part yang sama, tolak transaksi
    if (activeMprs.length > 0) {
      const duplicateParts = new Set();
      activeMprs.forEach(mpr => mpr.details.forEach(d => duplicateParts.add(d.part_id)));

      await transaction.rollback();
      return { 
        status: false, 
        error: `Duplicate FR-03! Part ID [${Array.from(duplicateParts).join(', ')}] has already been submitted in another active MPR document for this period.`, 
        code: 400 
      };
    }

    const status = save_as_draft ? 'draft' : 'submitted';
    const number = await generateNumber(transaction);

    const pr = await SMaterialPurchaseRequest.create({
      mrp_id: null,
      number,
      description,
      request_date: new Date(),
      type: 'manual',
      status,
      remarks: null,
      created_by: userId,
      approved_by: null
    }, { transaction });

    await upsertDetails(pr.id, details, transaction);

    // Log
    const logs = [{ mpr_id: pr.id, action: 'created', user_id: userId, status: 'draft' }];
    if (status === 'submitted') logs.push({ mpr_id: pr.id, action: 'submitted', user_id: userId, status: 'submitted' });
    await SMaterialPurchaseRequestLog.bulkCreate(logs, { transaction });

    await transaction.commit();

    return {
      status: true,
      data: { id: pr.id, number: pr.number, status: pr.status },
      message: `Purchase Request successfully created with status ${status}`
    };
  } catch (error) {
    await transaction.rollback();
    console.error('createEmergency PR error:', error);
    return { status: false, error: 'Failed to create Purchase Request', code: 500 };
  }
};

// ============================================================
// UPDATE PR (header + details)
// Hanya bisa saat status draft atau submitted
// Staff bisa edit description & details
// Body: { description?, details[]?, save_as_draft? }
// ============================================================
const update = async (req) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { description, details, save_as_draft = true } = req.body;

    const pr = await SMaterialPurchaseRequest.findByPk(id, { transaction });
    if (!pr) {
      await transaction.rollback();
      return { status: false, error: 'Purchase Request not found', code: 404 };
    }

    // Hanya bisa edit kalau draft atau submitted
    if (!['draft', 'submitted'].includes(pr.status)) {
      await transaction.rollback();
      return {
        status: false,
        error: `Purchase Request with status ${pr.status} cannot be edited`,
        code: 422
      };
    }

    // Kalau sudah approved, lock (double check)
    if (pr.status === 'approved') {
      await transaction.rollback();
      return { status: false, error: 'Purchase Request that has already been approved cannot be edited', code: 422 };
    }

    const newStatus = save_as_draft ? 'draft' : 'submitted';
    const updatePayload = { status: newStatus };
    if (description !== undefined) updatePayload.description = description;

    await pr.update(updatePayload, { transaction });

    // Update details jika dikirim
    if (details && Array.isArray(details)) {
      for (const [i, d] of details.entries()) {
        if (!d.part_id) {
          await transaction.rollback();
          return { status: false, error: `Part must be selected for item ${i + 1}`, code: 400 };
        }
        if (!d.qty || Number(d.qty) <= 0) {
          await transaction.rollback();
          return { status: false, error: `Quantity must be greater than 0 for item ${i + 1}`, code: 400 };
        }
      }

      const reqDate = pr.request_date ? new Date(pr.request_date) : new Date();
      const startOfMonth = new Date(reqDate.getFullYear(), reqDate.getMonth(), 1);
      const endOfMonth = new Date(reqDate.getFullYear(), reqDate.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const inputPartIds = details.map(d => d.part_id);

      const activeMprs = await SMaterialPurchaseRequest.findAll({
        where: {
          id: { [Op.ne]: id },
          status: { [Op.in]: ['draft', 'submitted'] },
          request_date: { [Op.between]: [startOfMonth, endOfMonth] }
        },
        include: [{
          model: TMaterialPurchaseRequestDetail,
          as: 'details',
          where: { part_id: { [Op.in]: inputPartIds } },
          attributes: ['part_id']
        }],
        transaction
      });

      if (activeMprs.length > 0) {
        const duplicateParts = new Set();
        activeMprs.forEach(mpr => mpr.details.forEach(d => duplicateParts.add(d.part_id)));

        await transaction.rollback();
        return { 
          status: false, 
          error: `Duplicate FR-03! Part ID [${Array.from(duplicateParts).join(', ')}] already exists in another active MPR document for this period.`, 
          code: 400 
        };
      }
      
      await upsertDetails(id, details, transaction);
    }

    // Log action
    const action = newStatus === 'submitted' ? 'submitted' : 'updated';
    await SMaterialPurchaseRequestLog.create({
      mpr_id: id,
      action,
      user_id: req.user.id,
      status: newStatus
    }, { transaction });

    await transaction.commit();

    return {
      status: true,
      data: { id: pr.id, number: pr.number, status: newStatus },
      message: `Purchase Request successfully updated with status ${newStatus}`
    };
  } catch (error) {
    await transaction.rollback();
    console.error('update PR error:', error);
    return { status: false, error: 'Failed to update Purchase Request', code: 500 };
  }
};

// ============================================================
// SUBMIT PR (draft → submitted)
// Dipakai jika sebelumnya disimpan sebagai draft
// ============================================================
const submit = async (req) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;

    const pr = await SMaterialPurchaseRequest.findByPk(id, {
      include: [{ model: TMaterialPurchaseRequestDetail, as: 'details' }],
      transaction
    });

    if (!pr) {
      await transaction.rollback();
      return { status: false, error: 'Purchase Request not found', code: 404 };
    }

    if (pr.status !== 'draft') {
      await transaction.rollback();
      return {
        status: false,
        error: `Only PR with draft status can be submitted`,
        code: 422
      };
    }

    if (!pr.details || pr.details.length === 0) {
      await transaction.rollback();
      return { status: false, error: 'PR must have at least 1 item before being submitted', code: 422 };
    }

    await pr.update({ status: 'submitted' }, { transaction });
    await SMaterialPurchaseRequestLog.create({
      mpr_id: id,
      action: 'submitted',
      user_id: req.user.id,
      status: 'submitted'
    }, { transaction });

    await transaction.commit();

    return {
      status: true,
      data: { id: pr.id, number: pr.number, status: 'submitted' },
      message: 'Purchase Request successfully submitted'
    };
  } catch (error) {
    await transaction.rollback();
    console.error('submit PR error:', error);
    return { status: false, error: 'Failed to submit Purchase Request', code: 500 };
  }
};

// ============================================================
// REVIEW PR (Supervisor): approve atau reject
// Body: { action: 'approve'|'reject', notes?: '...' }
// notes wajib jika action = 'reject'
// ============================================================
const review = async (req) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { action, notes } = req.body;
    const supervisorId = req.user.id;

    if (!['approve', 'reject'].includes(action)) {
      await transaction.rollback();
      return { status: false, error: 'Action must be either approve or reject', code: 400 };
    }

    if (action === 'reject' && !notes) {
      await transaction.rollback();
      return { status: false, error: 'Notes are required when rejecting PR', code: 400 };
    }

    const pr = await SMaterialPurchaseRequest.findByPk(id, { transaction });
    if (!pr) {
      await transaction.rollback();
      return { status: false, error: 'Purchase Request not found', code: 404 };
    }

    if (pr.status !== 'submitted') {
      await transaction.rollback();
      return {
        status: false,
        error: `Only PR with submitted status can be reviewed`,
        code: 422
      };
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pr.update({
      status: newStatus,
      approved_by: supervisorId,
      remarks: notes || null
    }, { transaction });

    await SMaterialPurchaseRequestLog.create({
      mpr_id: id,
      action: newStatus,
      user_id: supervisorId,
      status: newStatus,
      remarks: notes || null
    }, { transaction });

    await transaction.commit();

    return {
      status: true,
      data: { id: pr.id, number: pr.number, status: newStatus },
      message: `Purchase Request successfully ${newStatus}`
    };
  } catch (error) {
    await transaction.rollback();
    console.error('review PR error:', error);
    return { status: false, error: 'Failed to review Purchase Request', code: 500 };
  }
};

// ============================================================
// DELETE PR — hanya bisa saat status draft
// ============================================================
const deleteDraft = async (req) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;

    const pr = await SMaterialPurchaseRequest.findByPk(id, { transaction });
    if (!pr) {
      await transaction.rollback();
      return { status: false, error: 'Purchase Request not found', code: 404 };
    }

    if (pr.status !== 'draft') {
      await transaction.rollback();
      return {
        status: false,
        error: `Only PR with draft status can be deleted`,
        code: 422
      };
    }

    // Soft delete detail dan log juga
    await TMaterialPurchaseRequestDetail.destroy({ where: { mpr_id: id }, transaction });
    await SMaterialPurchaseRequestLog.destroy({ where: { mpr_id: id }, transaction });
    await pr.destroy({ transaction });

    await transaction.commit();

    return { status: true, message: 'Purchase Request successfully deleted' };
  } catch (error) {
    await transaction.rollback();
    console.error('deleteDraft PR error:', error);
    return { status: false, error: 'Failed to delete Purchase Request', code: 500 };
  }
};

export default {
  getDropdownStatuses,
  getDropdownParts,
  list,
  detail,
  createEmergency,
  update,
  submit,
  review,
  bulkReview,
  deleteDraft
};