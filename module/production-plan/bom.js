import { Op } from 'sequelize';
import Joi from 'joi';
import db from '../../models/index.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';

const {
  SBoms,
  SBomDetails,
  SParts,
  SUom,
  SUsers,
  RefBomDocumentStatus,
  RefBomActivationStatus,
  sequelize,
} = db;

const ALLOWED_DETAIL_TYPES = ['RAW', 'WIP', 'PRODUCT'];

const BOM_HEADER_INCLUDE = [
  { model: SParts,                  as: 'parent_part',       attributes: ['id', 'part_number', 'part_name', 'part_type_code'] },
  { model: SUom,                    as: 'uom',               attributes: ['id', 'code', 'name'] },
  { model: RefBomDocumentStatus,    as: 'doc_status',        attributes: ['id', 'code', 'name'] },
  { model: RefBomActivationStatus,  as: 'activation_status', attributes: ['id', 'code', 'name'] },
  { model: SUsers,                  as: 'creator',           attributes: ['id', 'email'] },
  { model: SUsers,                  as: 'approver',          attributes: ['id', 'email'] },
];

const BOM_DETAIL_INCLUDE = [
  { model: SParts, as: 'part', attributes: ['id', 'part_number', 'part_name', 'part_type_code'] },
  { model: SUom,   as: 'uom',  attributes: ['id', 'code', 'name'] },
  {
    model: SBoms,
    as: 'child_bom',
    attributes: ['id', 'bom_number', 'bom_version'],
    include: [{ model: SParts, as: 'parent_part', attributes: ['id', 'part_number', 'part_name'] }],
  },
];

const DETAIL_SCHEMA = Joi.object({
  part_id:          Joi.number().integer().required(),
  uom_id:           Joi.number().integer().optional().allow(null),
  qty_required:     Joi.number().positive().required(),
  scrap_percentage: Joi.number().min(0).max(100).default(0),
  level:            Joi.number().integer().min(0).max(5).optional().allow(null),
  sequence:         Joi.number().integer().default(0),
  type:             Joi.string().valid(...ALLOWED_DETAIL_TYPES).optional().allow(null),
  notes:            Joi.string().optional().allow('', null),
  child_bom_id:     Joi.number().integer().optional().allow(null),
});

async function generateBomNumber(part_id) {
  const part = await SParts.findByPk(part_id);
  if (!part) throw new Error('Parent part not found for BOM number generation');

  const prefix = `BOM-${part.part_number}`;
  const lastBom = await SBoms.findOne({
    where: { bom_number: { [Op.iLike]: `${prefix}-%` } },
    order: [['created_at', 'DESC']],
    paranoid: false,
  });

  let sequence = 1;
  if (lastBom) {
    const lastSeq = parseInt(lastBom.bom_number.replace(`${prefix}-`, ''), 10);
    if (!isNaN(lastSeq)) sequence = lastSeq + 1;
  }

  return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

/**
 * Validates a list of detail rows against the parent BOM.
 * Returns { ok: true } or { ok: false, error: string }.
 *
 * Checks:
 *  1. No duplicate part_id in the list.
 *  2. No part_id that matches the BOM's own parent_part_id (circular).
 *  3. child_bom_id (if supplied) must belong to a BOM whose parent_part_id === the detail's part_id.
 *  4. child_bom_id must not point to the BOM itself.
 */
async function validateDetails(details, bomId, parentPartId, transaction) {
  // 1. Duplicate check
  const partIds = details.map((d) => d.part_id);
  if (partIds.length !== new Set(partIds).size) {
    return { ok: false, error: 'Duplicate part_id found in BOM details' };
  }

  for (const d of details) {
    // 2. Circular: component === finished good
    if (parentPartId && d.part_id === parentPartId) {
      return { ok: false, error: `part_id ${d.part_id} is the same as the BOM parent part (circular reference)` };
    }

    // 3 & 4. Validate child_bom_id
    if (d.child_bom_id != null) {
      // 4. Must not point to itself
      if (Number(d.child_bom_id) === Number(bomId)) {
        return { ok: false, error: 'child_bom_id cannot reference the BOM itself' };
      }

      // 3. child_bom must exist and its parent_part_id must match this detail's part_id
      const childBom = await SBoms.findOne({
        where: { id: d.child_bom_id, deleted_at: null },
        attributes: ['id', 'parent_part_id'],
        transaction,
      });

      if (!childBom) {
        return { ok: false, error: `child_bom_id ${d.child_bom_id} not found` };
      }

      if (childBom.parent_part_id !== d.part_id) {
        return {
          ok: false,
          error: `child_bom_id ${d.child_bom_id} does not belong to part_id ${d.part_id}. child_bom must be a BOM whose parent_part matches this component.`,
        };
      }
    }
  }

  return { ok: true };
}

// ─── Module ──────────────────────────────────────────────────────────────────

class BomModule extends BaseModule {

  async getDocStatuses(req, res) {
    try {
      const rows = await RefBomDocumentStatus.findAll({
        where: { deleted_at: null },
        attributes: ['id', 'code', 'name', 'sequence'],
        order: [['sequence', 'ASC']],
      });
      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[BomModule][getDocStatuses]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async getActivationStatuses(req, res) {
    try {
      const rows = await RefBomActivationStatus.findAll({
        where: { deleted_at: null },
        attributes: ['id', 'code', 'name', 'sequence'],
        order: [['sequence', 'ASC']],
      });
      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[BomModule][getActivationStatuses]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async getDropdown(req, res) {
    try {
      const rows = await SBoms.findAll({
        where: { deleted_at: null },
        attributes: ['id', 'bom_number', 'bom_version'],
        include: [{ model: SParts, as: 'parent_part', attributes: ['id', 'part_number', 'part_name'] }],
        order: [['bom_number', 'ASC']],
      });
      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[BomModule][getDropdown]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      const { search = '', doc_status_id, activation_status_id, parent_part_id } = req.query;

      const where = { deleted_at: null };

      if (search) {
        where[Op.or] = [
          { bom_number:  { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (doc_status_id)        where.doc_status_id        = doc_status_id;
      if (activation_status_id) where.activation_status_id = activation_status_id;
      if (parent_part_id)       where.parent_part_id       = parent_part_id;

      const { count, rows } = await SBoms.findAndCountAll({
        where,
        limit,
        offset,
        include: BOM_HEADER_INCLUDE,
        order: [['created_at', 'DESC']],
        distinct: true,
      });

      // Total Components / Part
      const bomIds = rows.map((r) => r.id);
      const detailCounts = bomIds.length
        ? await SBomDetails.findAll({
            where: { bom_id: bomIds, deleted_at: null },
            attributes: ['bom_id', [sequelize.fn('COUNT', sequelize.col('id')), 'component_count']],
            group: ['bom_id'],
          })
        : [];

      const countMap = {};
      detailCounts.forEach((dc) => {
        countMap[dc.bom_id] = parseInt(dc.get('component_count'), 10);
      });
      const rowsWithCounts = rows.map((r) => ({
        ...r.toJSON(),
        component_count: countMap[r.id] || 0,
      }));

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: helper.getPaginationData(rowsWithCounts, count, page, limit),
      });
    } catch (error) {
      console.log('[BomModule][list]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async detail(req, res) {
    try {
      const { id } = req.params;

      const bom = await SBoms.findOne({
        where: { id, deleted_at: null },
        include: [
          ...BOM_HEADER_INCLUDE,
          {
            model: SBomDetails,
            as: 'details',
            where: { deleted_at: null },
            required: false,
            include: BOM_DETAIL_INCLUDE,
            order: [['sequence', 'ASC'], ['level', 'ASC']],
          },
        ],
      });

      if (!bom) return helper.sendResponse(res, { status: false, code: 404, error: 'BOM not found' });

      return helper.sendResponse(res, { status: true, code: 200, data: bom });
    } catch (error) {
      console.log('[BomModule][detail]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  //
  // POST /boms
  // Body: { parent_part_id, description?, uom_id?, notes?, details?: [...] }

  async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const schema = Joi.object({
        description:    Joi.string().max(255).optional().allow('', null),
        parent_part_id: Joi.number().integer().required(),
        uom_id:         Joi.number().integer().optional().allow(null),
        notes:          Joi.string().optional().allow('', null),
        details:        Joi.array().items(DETAIL_SCHEMA).optional().default([]),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { description, parent_part_id, uom_id, notes, details } = validation.value;

      // Validate parent_part exists
      const parentPart = await SParts.findByPk(parent_part_id, { transaction: t });
      if (!parentPart) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Parent part not found' });
      }

      const bom_number = await generateBomNumber(parent_part_id);

      const draftStatus = await RefBomDocumentStatus.findOne({
        where: { code: 'DRAFT', deleted_at: null },
        order: [['sequence', 'ASC']],
        transaction: t,
      });

      if (!draftStatus) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 500, error: 'Document status DRAFT not configured' });
      }

      // ── Handle soft-deleted BOM with same number ──
      let bom;
      const existing = await SBoms.findOne({ where: { bom_number }, paranoid: false, transaction: t });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'BOM number already exists' });
      }

      if (existing && existing.deleted_at) {
        const oldData = existing.toJSON();
        await existing.restore({ transaction: t });
        await existing.update({
          description, parent_part_id, uom_id, notes,
          bom_version: 1,
          doc_status_id: draftStatus.id,
          activation_status_id: null,
          reject_reason: null,
          approved_by: null,
          approved_at: null,
          activated_at: null,
          created_by: req.user?.id ?? null,
        }, { transaction: t });
        bom = existing;

        await this.logActivity(req, {
          moduleCode: 'bom', activityCode: 'RESTORE',
          resourceId: bom.id, oldData, newData: bom,
          description: `Restored BOM ${bom_number}`, transaction: t,
        });
      } else {
        bom = await SBoms.create({
          bom_number, description, parent_part_id, uom_id, notes,
          bom_version: 1,
          doc_status_id: draftStatus.id,
          created_by: req.user?.id ?? null,
        }, { transaction: t });

        await this.logActivity(req, {
          moduleCode: 'bom', activityCode: 'CREATE',
          resourceId: bom.id, newData: bom,
          description: `Created BOM ${bom_number}`, transaction: t,
        });
      }

      // ── Insert details (if provided) ──
      if (details.length) {
        const detailValidation = await validateDetails(details, bom.id, parent_part_id, t);
        if (!detailValidation.ok) {
          await t.rollback();
          return helper.sendResponse(res, { status: false, code: 400, error: detailValidation.error });
        }

        const detailRows = details.map((d, i) => ({
          ...d,
          bom_id: bom.id,
          sequence: d.sequence ?? i,
        }));
        await SBomDetails.bulkCreate(detailRows, { transaction: t });
      }

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 201,
        message: 'BOM created successfully',
        data: { id: bom.id, bom_number: bom.bom_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][create]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // Update (header + details)
  //
  // PUT /boms/:id
  // Body: { description?, uom_id?, notes?, details?: [...] }
  //
  // - Header fields yang dikirim akan diupdate.
  // - Jika `details` dikirim (array), existing details akan di-replace seluruhnya.
  // - Jika `details` tidak dikirim (undefined), details dibiarkan apa adanya.
  // - bom_number & parent_part_id tidak boleh diubah setelah create.

  async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        description: Joi.string().max(255).optional().allow('', null),
        uom_id:      Joi.number().integer().optional().allow(null),
        notes:       Joi.string().optional().allow('', null),
        details:     Joi.array().items(DETAIL_SCHEMA).optional(), // undefined = don't touch
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const bom = await this._getBomEditable(id, t);
      if (!bom.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: bom.code, error: bom.error });
      }

      const { details, ...headerFields } = validation.value;
      const oldData = bom.data.toJSON();

      // Update header
      await bom.data.update(headerFields, { transaction: t });

      // Update details only if the key was explicitly sent
      if (details !== undefined) {
        if (details.length) {
          const detailValidation = await validateDetails(details, id, bom.data.parent_part_id, t);
          if (!detailValidation.ok) {
            await t.rollback();
            return helper.sendResponse(res, { status: false, code: 400, error: detailValidation.error });
          }
        }

        // Hard-delete existing details, then re-insert
        await SBomDetails.destroy({ where: { bom_id: id }, transaction: t, force: true });

        if (details.length) {
          const rows = details.map((d, i) => ({
            ...d,
            bom_id: id,
            sequence: d.sequence ?? i,
          }));
          await SBomDetails.bulkCreate(rows, { transaction: t });
        }
      }

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'UPDATE',
        resourceId: bom.data.id, oldData, newData: bom.data,
        description: `Updated BOM ${bom.data.bom_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: 'BOM updated',
        data: { id: bom.data.id, bom_number: bom.data.bom_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][update]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async delete(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const bom = await SBoms.findOne({
        where: { id, deleted_at: null },
        include: [{ model: RefBomDocumentStatus, as: 'doc_status', attributes: ['code'] }],
        transaction: t,
      });

      if (!bom) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'BOM not found' });
      }
      if (bom.doc_status?.code !== 'DRAFT') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Draft BOMs can be deleted' });
      }

      const oldData = bom.toJSON();
      await bom.destroy({ transaction: t }); // soft delete (paranoid)

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'DELETE',
        resourceId: bom.id, oldData,
        description: `Deleted BOM ${bom.bom_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'BOM deleted' });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][delete]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Detail Management (single-row operations) ───────────────────────────────

  async addDetail(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const validation = helper.validate(req.body, DETAIL_SCHEMA);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const bom = await this._getBomEditable(id, t);
      if (!bom.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: bom.code, error: bom.error });
      }

      // Check for duplicate part_id in existing details
      const existingDetail = await SBomDetails.findOne({
        where: { bom_id: id, part_id: validation.value.part_id, deleted_at: null },
        transaction: t,
      });
      if (existingDetail) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: `part_id ${validation.value.part_id} already exists in this BOM` });
      }

      const detailValidation = await validateDetails([validation.value], id, bom.data.parent_part_id, t);
      if (!detailValidation.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: detailValidation.error });
      }

      const detail = await SBomDetails.create({ bom_id: id, ...validation.value }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'UPDATE',
        resourceId: bom.data.id, newData: detail,
        description: `Added detail to BOM ${bom.data.bom_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 201, message: 'Detail added', data: detail });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][addDetail]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Bulk Replace Details ────────────────────────────────────────────────────
  //
  // PUT /boms/:id/details/replace
  // Body: { details: [...] }
  // Used for drag-to-reorder saves — replaces ALL details at once.

  async replaceDetails(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        details: Joi.array().items(DETAIL_SCHEMA).required().min(0),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const bom = await this._getBomEditable(id, t);
      if (!bom.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: bom.code, error: bom.error });
      }

      const { details } = validation.value;

      if (details.length) {
        const detailValidation = await validateDetails(details, id, bom.data.parent_part_id, t);
        if (!detailValidation.ok) {
          await t.rollback();
          return helper.sendResponse(res, { status: false, code: 400, error: detailValidation.error });
        }
      }

      // Hard-delete all existing, then bulk insert
      await SBomDetails.destroy({ where: { bom_id: id }, transaction: t, force: true });

      let insertedDetails = [];
      if (details.length) {
        const rows = details.map((d, i) => ({
          ...d,
          bom_id: id,
          sequence: d.sequence ?? i,
        }));
        insertedDetails = await SBomDetails.bulkCreate(rows, { transaction: t });
      }

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'UPDATE',
        resourceId: bom.data.id, newData: { detail_count: insertedDetails.length },
        description: `Replaced all details on BOM ${bom.data.bom_number} (${insertedDetails.length} rows)`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: `Details replaced (${insertedDetails.length} rows)`,
        data: { bom_id: Number(id), detail_count: insertedDetails.length },
      });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][replaceDetails]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async updateDetail(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, detail_id } = req.params;

      const validation = helper.validate(req.body, DETAIL_SCHEMA);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const bom = await this._getBomEditable(id, t);
      if (!bom.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: bom.code, error: bom.error });
      }

      const detail = await SBomDetails.findOne({
        where: { id: detail_id, bom_id: id, deleted_at: null },
        transaction: t,
      });
      if (!detail) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Detail not found' });
      }

      // If part_id is changing, check for duplicates among other rows
      if (validation.value.part_id !== detail.part_id) {
        const duplicate = await SBomDetails.findOne({
          where: { bom_id: id, part_id: validation.value.part_id, deleted_at: null, id: { [Op.ne]: detail_id } },
          transaction: t,
        });
        if (duplicate) {
          await t.rollback();
          return helper.sendResponse(res, { status: false, code: 400, error: `part_id ${validation.value.part_id} already exists in this BOM` });
        }
      }

      const detailValidation = await validateDetails([validation.value], id, bom.data.parent_part_id, t);
      if (!detailValidation.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: detailValidation.error });
      }

      const oldData = detail.toJSON();
      await detail.update(validation.value, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'UPDATE',
        resourceId: bom.data.id, oldData, newData: detail,
        description: `Updated BOM detail #${detail_id} on ${bom.data.bom_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Detail updated', data: detail });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][updateDetail]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async deleteDetail(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, detail_id } = req.params;

      const bom = await this._getBomEditable(id, t);
      if (!bom.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: bom.code, error: bom.error });
      }

      const detail = await SBomDetails.findOne({
        where: { id: detail_id, bom_id: id, deleted_at: null },
        transaction: t,
      });
      if (!detail) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Detail not found' });
      }

      await detail.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'UPDATE',
        resourceId: bom.data.id,
        description: `Deleted BOM detail #${detail_id} from ${bom.data.bom_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Detail deleted' });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][deleteDetail]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Approval Workflow ───────────────────────────────────────────────────────
  // Submit → (Approve | Reject) → (Activate | Deactivate)

  async returnToDraft(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const bom = await SBoms.findOne({
        where: { id, deleted_at: null },
        include: [{ model: RefBomDocumentStatus, as: 'doc_status', attributes: ['id', 'code'] }],
        transaction: t,
      });

      if (!bom) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'BOM not found' });
      }

      if (!['REJECTED', 'PENDING_APPROVAL'].includes(bom.doc_status?.code)) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Rejected or Pending Approval BOMs can be returned to Draft' });
      }

      const draftStatus = await RefBomDocumentStatus.findOne({
        where: { code: 'DRAFT', deleted_at: null },
        transaction: t,
      });

      const oldData = bom.toJSON();
      await bom.update({ doc_status_id: draftStatus.id, reject_reason: null }, { transaction: t });
      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'RETURN_DRAFT',
        resourceId: bom.id, oldData, newData: bom,
        description: `Returned BOM ${bom.bom_number} to Draft`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: 'BOM returned to Draft',
        data: { id: bom.id, bom_number: bom.bom_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][returnToDraft]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async submit(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const bom = await SBoms.findOne({
        where: { id, deleted_at: null },
        include: [
          { model: RefBomDocumentStatus, as: 'doc_status', attributes: ['id', 'code'] },
          { model: SBomDetails, as: 'details', where: { deleted_at: null }, required: false },
        ],
        transaction: t,
      });

      if (!bom) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'BOM not found' });
      }
      if (!['DRAFT', 'REJECTED'].includes(bom.doc_status?.code)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Only Draft or Rejected BOMs can be submitted for approval',
        });
      }
      if (!bom.details?.length) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'BOM must have at least one component before submitting',
        });
      }

      const pendingStatus = await RefBomDocumentStatus.findOne({
        where: { code: 'PENDING_APPROVAL', deleted_at: null }, transaction: t,
      });
      if (!pendingStatus) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 500, error: 'Document status PENDING_APPROVAL not configured' });
      }

      const oldData = bom.toJSON();
      await bom.update({ doc_status_id: pendingStatus.id, reject_reason: null }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'SUBMIT',
        resourceId: bom.id, oldData, newData: bom,
        description: `Submitted BOM ${bom.bom_number} for approval`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: 'BOM submitted for approval',
        data: { id: bom.id, bom_number: bom.bom_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][submit]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async approve(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const bom = await SBoms.findOne({
        where: { id, deleted_at: null },
        include: [{ model: RefBomDocumentStatus, as: 'doc_status', attributes: ['id', 'code'] }],
        transaction: t,
      });

      if (!bom) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'BOM not found' });
      }
      if (bom.doc_status?.code !== 'PENDING_APPROVAL') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'BOM is not pending approval' });
      }

      const approvedStatus = await RefBomDocumentStatus.findOne({
        where: { code: 'APPROVED', deleted_at: null }, transaction: t,
      });
      if (!approvedStatus) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 500, error: 'Document status APPROVED not configured' });
      }

      const oldData = bom.toJSON();
      await bom.update({
        doc_status_id: approvedStatus.id,
        approved_by: req.user?.id ?? null,
        approved_at: new Date(),
        reject_reason: null,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'APPROVE',
        resourceId: bom.id, oldData, newData: bom,
        description: `Approved BOM ${bom.bom_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'BOM approved',
        data: { id: bom.id, bom_number: bom.bom_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][approve]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async reject(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({ reject_reason: Joi.string().required() });
      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const bom = await SBoms.findOne({
        where: { id, deleted_at: null },
        include: [{ model: RefBomDocumentStatus, as: 'doc_status', attributes: ['id', 'code'] }],
        transaction: t,
      });

      if (!bom) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'BOM not found' });
      }
      if (bom.doc_status?.code !== 'PENDING_APPROVAL') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'BOM is not pending approval' });
      }

      const rejectedStatus = await RefBomDocumentStatus.findOne({
        where: { code: 'REJECTED', deleted_at: null }, transaction: t,
      });
      if (!rejectedStatus) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 500, error: 'Document status REJECTED not configured' });
      }

      const oldData = bom.toJSON();
      await bom.update({
        doc_status_id: rejectedStatus.id,
        reject_reason: validation.value.reject_reason,
        approved_by: null,
        approved_at: null,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'REJECT',
        resourceId: bom.id, oldData, newData: bom,
        description: `Rejected BOM ${bom.bom_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'BOM rejected',
        data: { id: bom.id, bom_number: bom.bom_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][reject]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async activate(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const bom = await SBoms.findOne({
        where: { id, deleted_at: null },
        include: [
          { model: RefBomDocumentStatus,   as: 'doc_status',        attributes: ['id', 'code'] },
          { model: RefBomActivationStatus, as: 'activation_status', attributes: ['id', 'code'] },
        ],
        transaction: t,
      });

      if (!bom) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'BOM not found' });
      }
      if (bom.doc_status?.code !== 'APPROVED') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Approved BOMs can be activated' });
      }
      if (bom.activation_status?.code === 'ACTIVE') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'BOM is already active' });
      }

      const activeStatus = await RefBomActivationStatus.findOne({
        where: { code: 'ACTIVE', deleted_at: null }, transaction: t,
      });
      if (!activeStatus) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 500, error: 'Activation status ACTIVE not configured' });
      }

      const oldData = bom.toJSON();
      await bom.update({ activation_status_id: activeStatus.id, activated_at: new Date() }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'ACTIVATE',
        resourceId: bom.id, oldData, newData: bom,
        description: `Activated BOM ${bom.bom_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'BOM activated',
        data: { id: bom.id, bom_number: bom.bom_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][activate]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async deactivate(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const bom = await SBoms.findOne({
        where: { id, deleted_at: null },
        include: [{ model: RefBomActivationStatus, as: 'activation_status', attributes: ['id', 'code'] }],
        transaction: t,
      });

      if (!bom) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'BOM not found' });
      }
      if (bom.activation_status?.code !== 'ACTIVE') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'BOM is not active' });
      }

      const inactiveStatus = await RefBomActivationStatus.findOne({
        where: { code: 'INACTIVE', deleted_at: null }, transaction: t,
      });
      if (!inactiveStatus) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 500, error: 'Activation status INACTIVE not configured' });
      }

      const oldData = bom.toJSON();
      await bom.update({ activation_status_id: inactiveStatus.id }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'DEACTIVATE',
        resourceId: bom.id, oldData, newData: bom,
        description: `Deactivated BOM ${bom.bom_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'BOM deactivated',
        data: { id: bom.id, bom_number: bom.bom_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][deactivate]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── New Version ─────────────────────────────────────────────────────────────

  async newVersion(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const bom = await SBoms.findOne({
        where: { id, deleted_at: null },
        include: [
          { model: RefBomDocumentStatus, as: 'doc_status', attributes: ['code'] },
          { model: SBomDetails, as: 'details', where: { deleted_at: null }, required: false },
        ],
        transaction: t,
      });

      if (!bom) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'BOM not found' });
      }
      if (bom.doc_status?.code !== 'APPROVED') {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Only Approved BOMs can spawn a new version',
        });
      }

      const draftStatus = await RefBomDocumentStatus.findOne({
        where: { code: 'DRAFT', deleted_at: null }, transaction: t,
      });

      const newBomNumber = await generateBomNumber(bom.parent_part_id);

      const newBom = await SBoms.create({
        bom_number:     newBomNumber,
        description:    bom.description,
        parent_part_id: bom.parent_part_id,
        uom_id:         bom.uom_id,
        notes:          bom.notes,
        bom_version:    bom.bom_version + 1,
        doc_status_id:  draftStatus?.id ?? null,
        created_by:     req.user?.id ?? null,
      }, { transaction: t });

      if (bom.details?.length) {
        const cloned = bom.details.map((detail) => ({
          bom_id:           newBom.id,
          part_id:          detail.part_id,
          qty_required:     detail.qty_required,
          level:            detail.level ?? null,
          type:             detail.type ?? null,
          notes:            detail.notes ?? null,
          uom_id:           detail.uom_id ?? null,
          scrap_percentage: detail.scrap_percentage ?? 0,
          sequence:         detail.sequence ?? 0,
          child_bom_id:     detail.child_bom_id ?? null,
        }));

        await SBomDetails.bulkCreate(cloned, { transaction: t });
      }

      await this.logActivity(req, {
        moduleCode: 'bom', activityCode: 'CREATE',
        resourceId: newBom.id, newData: newBom,
        description: `Created new version v${newBom.bom_version} from BOM ${bom.bom_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 201,
        message: `New BOM version v${newBom.bom_version} created`,
        data: { id: newBom.id, bom_number: newBom.bom_number, bom_version: newBom.bom_version },
      });
    } catch (error) {
      await t.rollback();
      console.log('[BomModule][newVersion]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  async _getBomEditable(id, transaction) {
    const bom = await SBoms.findOne({
      where: { id, deleted_at: null },
      include: [{ model: RefBomDocumentStatus, as: 'doc_status', attributes: ['code'] }],
      transaction,
    });
    if (!bom)                              return { ok: false, code: 404, error: 'BOM not found' };
    if (bom.doc_status?.code !== 'DRAFT') return { ok: false, code: 400, error: 'Only Draft BOMs can be modified' };
    return { ok: true, data: bom };
  }
}

export default new BomModule();