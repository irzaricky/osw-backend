import { Op } from 'sequelize';
import Joi from 'joi';
import db from '../../models/index.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';

const {
  SProductionOrder,
  SProductionOrderProduct,
  SProductionOrderSchedule,
  SProductionOrderRescheduleLog,
  SProductionPlan,
  SProductionPlanDetail,
  SCustomers,
  SParts,
  SLines,
  SShifts,
  SUsers,
  SWorkOrder,
  sequelize,
} = db;

// ─── Shared include helpers ──────────────────────────────────────────────────

const PO_HEADER_INCLUDE = [
  {
    model: SProductionPlan,
    as: 'plan',
    attributes: ['id', 'plan_number', 'plan_description', 'overall_status'],
  },
  { model: SUsers, as: 'creator',   attributes: ['id', 'email'] },
  { model: SUsers, as: 'releaser',  attributes: ['id', 'email'] },
  { model: SUsers, as: 'rejector',  attributes: ['id', 'email'] },
  { model: SUsers, as: 'canceller', attributes: ['id', 'email'] },
];

const PRODUCT_INCLUDE = [
  { model: SCustomers, as: 'customer', attributes: ['id', 'name'] },
  { model: SParts,     as: 'part',     attributes: ['id', 'part_number', 'part_name'] },
  { model: SLines,     as: 'line',     attributes: ['id', 'name'] },
  {
    model: SProductionPlanDetail,
    as: 'plan_detail',
    attributes: ['id', 'qty_request', 'qty_capacity', 'capacity_gap', 'status', 'delivery_date'],
  },
];

const SCHEDULE_INCLUDE = [
  { model: SLines,  as: 'line',  attributes: ['id', 'name'] },
  { model: SShifts, as: 'shift', attributes: ['id', 'name', 'start_time', 'end_time'] },
  { model: SParts,  as: 'part',  attributes: ['id', 'part_number', 'part_name'] },
];

// ─── Status transition map ───────────────────────────────────────────────────
// Draft → Released → (In_Progress → Completed → Closed) | Rejected | Cancelled
const VALID_TRANSITIONS = {
  Draft:       ['Released', 'Cancelled'],
  Released:    ['In_Progress', 'Rejected', 'Cancelled'],
  In_Progress: ['Completed', 'Cancelled'],
  Completed:   ['Closed'],
  Rejected:    ['Released'],           // allow re-release after rejection
  Closed:      [],
  Cancelled:   [],
};

class OrderScheduleModule extends BaseModule {

  async getDropdown(req, res) {
    try {
      const rows = await SProductionOrder.findAll({
        where: { deleted_at: null, status: { [Op.notIn]: ['Cancelled', 'Closed'] } },
        attributes: ['id', 'po_number', 'status', 'production_start_date', 'production_end_date'],
        order: [['po_number', 'DESC']],
      });
      return helper.sendResponse(res, { status: true, code: 200, data: rows });
    } catch (error) {
      console.log('[OrderScheduleModule][getDropdown]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      const {
        search = '',
        status,
        priority,
        plan_id,
        date_from,
        date_to,
      } = req.query;

      const where = { deleted_at: null };

      if (search) {
        where[Op.or] = [
          { po_number:      { [Op.iLike]: `%${search}%` } },
          { po_description: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (status)   where.status   = status;
      if (priority) where.priority = priority;
      if (plan_id)  where.plan_id  = plan_id;
      if (date_from || date_to) {
        where.production_start_date = {};
        if (date_from) where.production_start_date[Op.gte] = date_from;
        if (date_to)   where.production_start_date[Op.lte] = date_to;
      }

      const { count, rows } = await SProductionOrder.findAndCountAll({
        where,
        limit,
        offset,
        include: PO_HEADER_INCLUDE,
        order: [['created_at', 'DESC']],
        distinct: true,
      });

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      });
    } catch (error) {
      console.log('[OrderScheduleModule][list]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async detail(req, res) {
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({
        where: { id, deleted_at: null },
        include: [
          ...PO_HEADER_INCLUDE,
          {
            model: SProductionOrderProduct,
            as: 'products',
            include: [
              ...PRODUCT_INCLUDE,
              {
                model: SProductionOrderSchedule,
                as: 'schedules',
                include: SCHEDULE_INCLUDE,
                order: [['sequence', 'ASC'], ['production_date', 'ASC']],
              },
            ],
            order: [['sequence', 'ASC']],
          },
          {
            model: SProductionOrderRescheduleLog,
            as: 'reschedule_logs',
            include: [{ model: SUsers, as: 'rescheduler', attributes: ['id', 'email'] }],
            order: [['rescheduled_at', 'DESC']],
          },
        ],
      });

      if (!po) {
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }

      return helper.sendResponse(res, { status: true, code: 200, data: po });
    } catch (error) {
      console.log('[OrderScheduleModule][detail]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE
  // Builds a PO from an Approved Production Plan — products are derived
  // from the plan's details, caller assigns line & date range.
  // ─────────────────────────────────────────────────────────────────────────

  async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const schema = Joi.object({
        plan_id:               Joi.number().integer().required(),
        production_start_date: Joi.date().iso().required(),
        production_end_date:   Joi.date().iso().min(Joi.ref('production_start_date')).required(),
        priority:              Joi.string().valid('Low', 'Medium', 'High', 'Critical').default('Medium'),
        po_description:        Joi.string().optional().allow('', null),
        notes:                 Joi.string().optional().allow('', null),
        products: Joi.array().items(Joi.object({
          plan_detail_id: Joi.number().integer().required(),
          customer_id:    Joi.number().integer().required(),
          part_id:        Joi.number().integer().required(),
          line_id:        Joi.number().integer().required(),
          delivery_date:  Joi.date().iso().required(),
          planned_qty:    Joi.number().integer().positive().required(),
          notes:          Joi.string().optional().allow('', null),
        })).min(1).required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { plan_id, production_start_date, production_end_date, priority, po_description, notes, products } = validation.value;

      // Validate plan exists and is Approved
      const plan = await SProductionPlan.findOne({
        where: { id: plan_id, status: 'Approved', deleted_at: null },
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Production Plan not found or not in Approved status',
        });
      }

      // Validate all plan_detail_ids belong to the given plan
      const planDetailIds = products.map((p) => p.plan_detail_id);
      const validDetails = await SProductionPlanDetail.findAll({
        where: { id: { [Op.in]: planDetailIds }, plan_id },
        transaction: t,
      });
      if (validDetails.length !== new Set(planDetailIds).size) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'One or more plan_detail_id values are invalid or do not belong to the selected plan',
        });
      }

      // Generate PO number: PO-YYYY-MM-NNNNN
      const now = new Date();
      const prefix = `PO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
      const lastPO = await SProductionOrder.findOne({
        where: { po_number: { [Op.iLike]: `${prefix}%` } },
        order: [['po_number', 'DESC']],
        paranoid: false,
        transaction: t,
      });
      const seq = lastPO
        ? String(parseInt(lastPO.po_number.split('-').pop()) + 1).padStart(5, '0')
        : '00001';
      const po_number = `${prefix}${seq}`;

      // Aggregate dates from products for delivery window
      const allDeliveryDates  = products.map((p) => new Date(p.delivery_date));
      const earliest_delivery_date = new Date(Math.min(...allDeliveryDates));
      const latest_delivery_date   = new Date(Math.max(...allDeliveryDates));
      const total_planned_qty      = products.reduce((s, p) => s + p.planned_qty, 0);

      // Create PO header
      const po = await SProductionOrder.create({
        po_number,
        plan_id,
        production_start_date,
        production_end_date,
        earliest_delivery_date,
        latest_delivery_date,
        priority,
        po_description,
        notes,
        total_products:    products.length,
        total_planned_qty,
        status:     'Draft',
        created_by: req.user?.id ?? null,
      }, { transaction: t });

      // Create product lines
      const productRows = products.map((p, i) => ({
        po_id:          po.id,
        sequence:       i + 1,
        plan_detail_id: p.plan_detail_id,
        customer_id:    p.customer_id,
        part_id:        p.part_id,
        line_id:        p.line_id,
        delivery_date:  p.delivery_date,
        planned_qty:    p.planned_qty,
        notes:          p.notes ?? null,
      }));
      await SProductionOrderProduct.bulkCreate(productRows, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'CREATE',
        resourceId: po.id,
        newData: po,
        description: `Created Production Order ${po_number}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 201,
        message: 'Production Order created successfully',
        data: { id: po.id, po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][create]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        production_start_date: Joi.date().iso().optional(),
        production_end_date:   Joi.date().iso().optional(),
        priority:              Joi.string().valid('Low', 'Medium', 'High', 'Critical').optional(),
        po_description:        Joi.string().optional().allow('', null),
        notes:                 Joi.string().optional().allow('', null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await SProductionOrder.findOne({
        where: { id, deleted_at: null },
        transaction: t,
      });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Draft') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Draft Production Orders can be edited' });
      }

      const oldData = po.toJSON();
      await po.update(validation.value, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'UPDATE',
        resourceId: po.id,
        oldData,
        newData: po,
        description: `Updated Production Order ${po.po_number}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Production Order updated', data: po });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][update]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async delete(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Draft') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Draft Production Orders can be deleted' });
      }

      const oldData = po.toJSON();
      await po.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'DELETE',
        resourceId: po.id,
        oldData,
        description: `Deleted Production Order ${po.po_number}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Production Order deleted' });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][delete]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async addProduct(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        plan_detail_id: Joi.number().integer().required(),
        customer_id:    Joi.number().integer().required(),
        part_id:        Joi.number().integer().required(),
        line_id:        Joi.number().integer().required(),
        delivery_date:  Joi.date().iso().required(),
        planned_qty:    Joi.number().integer().positive().required(),
        notes:          Joi.string().optional().allow('', null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await this._getPoEditable(id, t);
      if (!po.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: po.code, error: po.error });
      }

      // Auto sequence
      const lastProduct = await SProductionOrderProduct.findOne({
        where: { po_id: id },
        order: [['sequence', 'DESC']],
        transaction: t,
      });
      const sequence = lastProduct ? lastProduct.sequence + 1 : 1;

      const product = await SProductionOrderProduct.create(
        { po_id: id, sequence, ...validation.value },
        { transaction: t }
      );

      // Update PO totals
      await this._recalculateTotals(id, t);

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 201, message: 'Product added', data: product });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][addProduct]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async updateProduct(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, product_id } = req.params;

      const schema = Joi.object({
        line_id:       Joi.number().integer().optional(),
        delivery_date: Joi.date().iso().optional(),
        planned_qty:   Joi.number().integer().positive().optional(),
        notes:         Joi.string().optional().allow('', null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await this._getPoEditable(id, t);
      if (!po.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: po.code, error: po.error });
      }

      const product = await SProductionOrderProduct.findOne({
        where: { id: product_id, po_id: id },
        transaction: t,
      });
      if (!product) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Product line not found' });
      }

      // Block update if already has schedules
      const scheduleCount = await SProductionOrderSchedule.count({
        where: { po_product_id: product_id },
        transaction: t,
      });
      if (scheduleCount > 0 && validation.value.planned_qty !== undefined) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Cannot change planned_qty — schedules already exist. Delete schedules first.',
        });
      }

      const oldData = product.toJSON();
      await product.update(validation.value, { transaction: t });
      await this._recalculateTotals(id, t);

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'UPDATE',
        resourceId: po.data.id,
        oldData,
        newData: product,
        description: `Updated product line #${product_id} on PO ${po.data.po_number}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Product updated', data: product });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][updateProduct]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async deleteProduct(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, product_id } = req.params;

      const po = await this._getPoEditable(id, t);
      if (!po.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: po.code, error: po.error });
      }

      const product = await SProductionOrderProduct.findOne({
        where: { id: product_id, po_id: id },
        transaction: t,
      });
      if (!product) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Product line not found' });
      }

      // Cascade: schedules deleted by DB FK, but check for released WOs
      const activeWOs = await SWorkOrder.count({
        where: {
          po_id: id,
          status: { [Op.notIn]: ['Cancelled', 'Completed'] },
        },
        include: [{
          model: SProductionOrderSchedule,
          as: 'schedule',
          where: { po_product_id: product_id },
          required: true,
        }],
        transaction: t,
      });
      if (activeWOs > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Cannot delete product line — active Work Orders exist for its schedules',
        });
      }

      await product.destroy({ transaction: t }); // cascade deletes schedules
      await this._recalculateTotals(id, t);

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Product line deleted' });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][deleteProduct]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async addSchedule(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, product_id } = req.params;

      const schema = Joi.object({
        production_date:       Joi.date().iso().required(),
        shift_id:              Joi.number().integer().required(),
        planned_qty_per_day:   Joi.number().integer().positive().required(),
        line_capacity_per_day: Joi.number().integer().optional().allow(null),
        notes:                 Joi.string().optional().allow('', null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      // PO must be Draft or Released to add schedules
      const po = await SProductionOrder.findOne({
        where: { id, deleted_at: null },
        transaction: t,
      });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (!['Draft', 'Released'].includes(po.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Schedules can only be added to Draft or Released Production Orders',
        });
      }

      const product = await SProductionOrderProduct.findOne({
        where: { id: product_id, po_id: id },
        transaction: t,
      });
      if (!product) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Product line not found' });
      }

      // Validate production_date is within PO date range
      const prodDate = new Date(validation.value.production_date);
      if (prodDate < new Date(po.production_start_date) || prodDate > new Date(po.production_end_date)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `Production date must be between ${po.production_start_date} and ${po.production_end_date}`,
        });
      }

      // Validate total scheduled qty won't exceed planned
      const existingScheduled = await SProductionOrderSchedule.sum('planned_qty_per_day', {
        where: { po_product_id: product_id },
        transaction: t,
      });
      const newTotal = (existingScheduled || 0) + validation.value.planned_qty_per_day;
      if (newTotal > product.planned_qty) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `Scheduled qty (${newTotal}) would exceed planned qty (${product.planned_qty})`,
        });
      }

      // Auto sequence
      const lastSchedule = await SProductionOrderSchedule.findOne({
        where: { po_product_id: product_id },
        order: [['sequence', 'DESC']],
        transaction: t,
      });
      const sequence = lastSchedule ? lastSchedule.sequence + 1 : 1;

      // Compute utilization if line_capacity_per_day provided
      const { planned_qty_per_day, line_capacity_per_day } = validation.value;
      const utilization_pct = line_capacity_per_day
        ? parseFloat(((planned_qty_per_day / line_capacity_per_day) * 100).toFixed(2))
        : null;

      const schedule = await SProductionOrderSchedule.create({
        po_id:          id,
        po_product_id:  product_id,
        sequence,
        part_id:        product.part_id,
        line_id:        product.line_id,
        status:         'Scheduled',
        utilization_pct,
        ...validation.value,
      }, { transaction: t });

      // Update product scheduled_qty and PO total_scheduled_qty
      await this._recalculateScheduledQty(product_id, id, t);

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 201, message: 'Schedule added', data: schedule });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][addSchedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async updateSchedule(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, product_id, schedule_id } = req.params;

      const schema = Joi.object({
        production_date:       Joi.date().iso().optional(),
        shift_id:              Joi.number().integer().optional(),
        planned_qty_per_day:   Joi.number().integer().positive().optional(),
        line_capacity_per_day: Joi.number().integer().optional().allow(null),
        status:                Joi.string().valid('Scheduled', 'In_Progress', 'Completed', 'Cancelled').optional(),
        notes:                 Joi.string().optional().allow('', null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const schedule = await SProductionOrderSchedule.findOne({
        where: { id: schedule_id, po_product_id: product_id, po_id: id },
        transaction: t,
      });
      if (!schedule) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Schedule not found' });
      }
      if (schedule.status === 'Completed') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Completed schedules cannot be modified' });
      }

      // Re-check qty cap if planned_qty_per_day changing
      if (validation.value.planned_qty_per_day !== undefined) {
        const product = await SProductionOrderProduct.findByPk(product_id, { transaction: t });
        const otherScheduled = await SProductionOrderSchedule.sum('planned_qty_per_day', {
          where: { po_product_id: product_id, id: { [Op.ne]: schedule_id } },
          transaction: t,
        });
        const newTotal = (otherScheduled || 0) + validation.value.planned_qty_per_day;
        if (newTotal > product.planned_qty) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `Scheduled qty (${newTotal}) would exceed planned qty (${product.planned_qty})`,
          });
        }
      }

      // Recalculate utilization if capacity or qty changed
      const newCapacity = validation.value.line_capacity_per_day ?? schedule.line_capacity_per_day;
      const newQty      = validation.value.planned_qty_per_day   ?? schedule.planned_qty_per_day;
      if (newCapacity) {
        validation.value.utilization_pct = parseFloat(((newQty / newCapacity) * 100).toFixed(2));
      }

      const oldData = schedule.toJSON();
      await schedule.update(validation.value, { transaction: t });
      await this._recalculateScheduledQty(product_id, id, t);

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'UPDATE',
        resourceId: Number(id),
        oldData,
        newData: schedule,
        description: `Updated schedule #${schedule_id} on PO product #${product_id}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Schedule updated', data: schedule });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][updateSchedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async deleteSchedule(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, product_id, schedule_id } = req.params;

      const schedule = await SProductionOrderSchedule.findOne({
        where: { id: schedule_id, po_product_id: product_id, po_id: id },
        transaction: t,
      });
      if (!schedule) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Schedule not found' });
      }
      if (['Completed', 'In_Progress'].includes(schedule.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `Cannot delete a schedule with status '${schedule.status}'`,
        });
      }

      // Check for Work Orders
      const activeWOs = await SWorkOrder.count({
        where: {
          po_schedule_id: schedule_id,
          status: { [Op.notIn]: ['Cancelled'] },
        },
        transaction: t,
      });
      if (activeWOs > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Cannot delete schedule — active Work Orders exist',
        });
      }

      await schedule.destroy({ transaction: t });
      await this._recalculateScheduledQty(product_id, id, t);

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Schedule deleted' });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][deleteSchedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async release(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({
        where: { id, deleted_at: null },
        include: [{
          model: SProductionOrderProduct,
          as: 'products',
          include: [{ model: SProductionOrderSchedule, as: 'schedules' }],
        }],
        transaction: t,
      });

      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (!VALID_TRANSITIONS[po.status]?.includes('Released')) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `Cannot release a Production Order with status '${po.status}'`,
        });
      }

      // Validate: every product must have at least one schedule
      const unscheduled = po.products.filter((p) => !p.schedules?.length);
      if (unscheduled.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `${unscheduled.length} product line(s) have no schedule. Add schedules before releasing.`,
        });
      }

      const oldData = po.toJSON();
      await po.update({
        status:      'Released',
        released_by: req.user?.id ?? null,
        released_at: new Date(),
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'RELEASE',
        resourceId: po.id,
        oldData,
        newData: po,
        description: `Released Production Order ${po.po_number}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: 'Production Order released',
        data: { id: po.id, po_number: po.po_number, status: 'Released' },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][release]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async reject(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema = Joi.object({ reason: Joi.string().required() });
      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (!VALID_TRANSITIONS[po.status]?.includes('Rejected')) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `Cannot reject a Production Order with status '${po.status}'`,
        });
      }

      const oldData = po.toJSON();
      await po.update({
        status:      'Rejected',
        rejected_by: req.user?.id ?? null,
        rejected_at: new Date(),
        notes: validation.value.reason,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'REJECT',
        resourceId: po.id,
        oldData,
        newData: po,
        description: `Rejected Production Order ${po.po_number}: ${validation.value.reason}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: 'Production Order rejected',
        data: { id: po.id, po_number: po.po_number, status: 'Rejected' },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][reject]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async cancel(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema = Joi.object({ reason: Joi.string().required() });
      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (!VALID_TRANSITIONS[po.status]?.includes('Cancelled')) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `Cannot cancel a Production Order with status '${po.status}'`,
        });
      }

      // Cancel all non-completed work orders
      await SWorkOrder.update(
        { status: 'Cancelled' },
        {
          where: { po_id: id, status: { [Op.notIn]: ['Completed', 'Cancelled'] } },
          transaction: t,
        }
      );

      const oldData = po.toJSON();
      await po.update({
        status:        'Cancelled',
        cancelled_by:  req.user?.id ?? null,
        cancelled_at:  new Date(),
        notes:         validation.value.reason,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'CANCEL',
        resourceId: po.id,
        oldData,
        newData: po,
        description: `Cancelled Production Order ${po.po_number}: ${validation.value.reason}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: 'Production Order cancelled',
        data: { id: po.id, po_number: po.po_number, status: 'Cancelled' },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][cancel]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async complete(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (!VALID_TRANSITIONS[po.status]?.includes('Completed')) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `Cannot complete a Production Order with status '${po.status}'`,
        });
      }

      // Validate: no pending/in-progress work orders remain
      const pendingWOs = await SWorkOrder.count({
        where: { po_id: id, status: { [Op.in]: ['Released', 'In_Progress'] } },
        transaction: t,
      });
      if (pendingWOs > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `${pendingWOs} Work Order(s) are still pending or in progress`,
        });
      }

      const oldData = po.toJSON();
      await po.update({ status: 'Completed', completed_at: new Date() }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'COMPLETE',
        resourceId: po.id,
        oldData,
        newData: po,
        description: `Completed Production Order ${po.po_number}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: 'Production Order completed',
        data: { id: po.id, po_number: po.po_number, status: 'Completed' },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][complete]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async close(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (!VALID_TRANSITIONS[po.status]?.includes('Closed')) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `Only Completed Production Orders can be closed`,
        });
      }

      const oldData = po.toJSON();
      await po.update({ status: 'Closed', closed_at: new Date() }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'CLOSE',
        resourceId: po.id,
        oldData,
        newData: po,
        description: `Closed Production Order ${po.po_number}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: 'Production Order closed',
        data: { id: po.id, po_number: po.po_number, status: 'Closed' },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][close]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async reschedule(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        new_start_date:    Joi.date().iso().required(),
        new_end_date:      Joi.date().iso().min(Joi.ref('new_start_date')).required(),
        reschedule_reason: Joi.string().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (!['Draft', 'Released'].includes(po.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: 'Only Draft or Released Production Orders can be rescheduled',
        });
      }

      const { new_start_date, new_end_date, reschedule_reason } = validation.value;

      // Count WOs that will be impacted (not cancelled/completed)
      const impacted_wo_count = await SWorkOrder.count({
        where: {
          po_id:  id,
          status: { [Op.notIn]: ['Cancelled', 'Completed'] },
        },
        transaction: t,
      });

      // Log the reschedule
      await SProductionOrderRescheduleLog.create({
        po_id:             id,
        old_start_date:    po.production_start_date,
        old_end_date:      po.production_end_date,
        new_start_date,
        new_end_date,
        reschedule_reason,
        impacted_wo_count,
        rescheduled_by:    req.user?.id ?? null,
        rescheduled_at:    new Date(),
      }, { transaction: t });

      // Update PO dates
      await po.update({
        production_start_date: new_start_date,
        production_end_date:   new_end_date,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production-order',
        activityCode: 'RESCHEDULE',
        resourceId: po.id,
        description: `Rescheduled PO ${po.po_number}: ${po.production_start_date}→${new_start_date}, ${po.production_end_date}→${new_end_date}`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: `Production Order rescheduled. ${impacted_wo_count} Work Order(s) may be affected.`,
        data: { id: po.id, po_number: po.po_number, new_start_date, new_end_date, impacted_wo_count },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][reschedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async getRescheduleLogs(req, res) {
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null } });
      if (!po) {
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }

      const logs = await SProductionOrderRescheduleLog.findAll({
        where: { po_id: id },
        include: [{ model: SUsers, as: 'rescheduler', attributes: ['id', 'email'] }],
        order: [['rescheduled_at', 'DESC']],
      });

      return helper.sendResponse(res, { status: true, code: 200, data: logs });
    } catch (error) {
      console.log('[OrderScheduleModule][getRescheduleLogs]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async _getPoEditable(id, transaction) {
    const po = await SProductionOrder.findOne({
      where: { id, deleted_at: null },
      transaction,
    });
    if (!po)                    return { ok: false, code: 404, error: 'Production Order not found' };
    if (po.status !== 'Draft')  return { ok: false, code: 400, error: 'Only Draft Production Orders can be modified' };
    return { ok: true, data: po };
  }

  async _recalculateTotals(po_id, transaction) {
    const products = await SProductionOrderProduct.findAll({
      where: { po_id },
      transaction,
    });
    await SProductionOrder.update({
      total_products:    products.length,
      total_planned_qty: products.reduce((s, p) => s + (p.planned_qty || 0), 0),
    }, { where: { id: po_id }, transaction });
  }

  async _recalculateScheduledQty(po_product_id, po_id, transaction) {
    // Update product's scheduled_qty
    const scheduledQty = await SProductionOrderSchedule.sum('planned_qty_per_day', {
      where: { po_product_id, status: { [Op.ne]: 'Cancelled' } },
      transaction,
    });
    await SProductionOrderProduct.update(
      { scheduled_qty: scheduledQty || 0 },
      { where: { id: po_product_id }, transaction }
    );

    // Update PO total_scheduled_qty
    const totalScheduled = await SProductionOrderProduct.sum('scheduled_qty', {
      where: { po_id },
      transaction,
    });
    await SProductionOrder.update(
      { total_scheduled_qty: totalScheduled || 0 },
      { where: { id: po_id }, transaction }
    );
  }
}

export default new OrderScheduleModule();