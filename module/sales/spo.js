import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import dayjs from 'dayjs';

const {
  SSalesPurchaseOrders, SSalesPurchaseOrderDetails,
  SSalesPurchaseRequests, SSalesPurchaseRequestDetails, SSalesForecasts,
  SDeliveryOrders, SDeliveryOrderDetails, SDeliveryPlanDetails,
  SDeliveryPlans,
  SParts, SCustomers, SUsers, SUserDetail
} = db;

class SPOModule extends BaseModule {

  async getDropdownStatuses(req) {
    return {
      status: true,
      data: ['Draft', 'Submitted', 'Locked', 'Processing', 'Completed']
    };
  }

  async getDropdownCustomers(req) {
    try {
      const customers = await SCustomers.findAll({
        attributes: ['id', 'name', 'customer_code'],
        order: [['name', 'ASC']]
      });
      return { status: true, data: customers };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // Get all Approved SPRs that haven't been generated into an SPO
  async listSPR(req) {
    try {
      // Find SPRs with status 'Approved'
      // that are not referenced in SSalesPurchaseOrders
      const sprs = await SSalesPurchaseRequests.findAll({
        where: {
          status: 'Approved',
          id: {
            [Op.notIn]: db.sequelize.literal(`(SELECT spr_id FROM s_sales_purchase_orders WHERE spr_id IS NOT NULL AND deleted_at IS NULL)`)
          }
        },
        include: [
          {
            model: SSalesForecasts,
            as: 'forecast',
            attributes: ['customer_id']
          },
          {
            model: SSalesPurchaseRequestDetails,
            as: 'details',
            include: [{ model: SParts, as: 'part', attributes: ['part_number', 'part_name'] }]
          }
        ],
        order: [['created_at', 'DESC']]
      });

      return { status: true, data: sprs };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async list(req) {
    try {
      const params = req.query;
      const { start_date, end_date, status, search } = params;
      const { limit, page, offset } = helper.getPagination(params);

      const where = {};

      if (start_date && end_date) {
        where.spo_date = { [Op.between]: [start_date, end_date] };
      }

      if (status) {
        where.status = status;
      }

      if (search) {
        where[Op.or] = [
          { spo_number: { [Op.like]: `%${search}%` } },
          { shipping_address: { [Op.like]: `%${search}%` } }
        ];
      }

      const include = [
        {
          model: SCustomers,
          as: 'customer',
          attributes: ['id', 'name', 'customer_code']
        },
        {
          model: SSalesPurchaseRequests,
          as: 'spr',
          attributes: ['id', 'spr_number']
        },
        {
          model: SUsers,
          as: 'creator',
          attributes: ['id', 'email'],
          include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
        }
      ];

      const { count, rows } = await SSalesPurchaseOrders.findAndCountAll({
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

  async _generateSPONumber(transaction) {
    // Format: SPO-YYYY-MM-XXX
    const currentMonthStr = dayjs().format('YYYY-MM');
    const prefix = `SPO-${currentMonthStr}`;

    const lastSPO = await SSalesPurchaseOrders.findOne({
      where: { spo_number: { [Op.like]: `${prefix}-%` } },
      order: [['spo_number', 'DESC']],
      transaction,
      paranoid: false
    });

    let seq = 1;
    if (lastSPO) {
      const parts = lastSPO.spo_number.split('-');
      const lastSeqStr = parts[parts.length - 1];
      if (!isNaN(lastSeqStr)) {
        seq = parseInt(lastSeqStr, 10) + 1;
      }
    }

    return `${prefix}-${seq.toString().padStart(3, '0')}`; // requested format SPO-2025-11-088
  }

  async createSpo(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;
      const currentUser = req.user;

      const schema = Joi.object({
        spr_id: Joi.number().integer().required(),
        customer_id: Joi.number().integer().required(),
        shipping_address: Joi.string().required(),
        spo_date: Joi.date().iso().required(),
        delivery_due_date: Joi.date().iso().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { spr_id, customer_id, shipping_address, spo_date, delivery_due_date } = validation.value;

      // Check if SPR exists and is Approved
      const spr = await SSalesPurchaseRequests.findByPk(spr_id, {
        include: [{ model: SSalesPurchaseRequestDetails, as: 'details' }],
        transaction: t
      });

      if (!spr) {
        await t.rollback();
        return { status: false, message: 'SPR not found', code: 404 };
      }

      if (spr.status !== 'Approved') {
        await t.rollback();
        return { status: false, message: 'Only Approved SPR can be generated into SPO', code: 400 };
      }

      // Check if SPR is already used
      const existingSpo = await SSalesPurchaseOrders.findOne({ where: { spr_id }, transaction: t });
      if (existingSpo) {
        await t.rollback();
        return { status: false, message: 'This SPR has already been generated into an SPO', code: 400 };
      }

      // Check if Customer exists
      const customer = await SCustomers.findByPk(customer_id, { transaction: t });
      if (!customer) {
        await t.rollback();
        return { status: false, message: 'Customer not found', code: 404 };
      }

      const spo_number = await this._generateSPONumber(t);

      const spo = await SSalesPurchaseOrders.create({
        spo_number,
        customer_id,
        spr_id,
        shipping_address,
        spo_date,
        delivery_due_date,
        status: 'Draft',
        created_by: currentUser.id
      }, { transaction: t });

      // Copy SPR Details to SPO Details
      if (spr.details && spr.details.length > 0) {
        const spoDetails = spr.details.map(d => ({
          spo_id: spo.id,
          part_id: d.part_id,
          ordered_qty: d.qty,
          sent_qty: 0,
          status: 'Open'
        }));
        await SSalesPurchaseOrderDetails.bulkCreate(spoDetails, { transaction: t });
      }

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'CREATE_SPO',
        resourceId: spo.id,
        newData: spo,
        description: `Generated SPO ${spo_number} from SPR ${spr.spr_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'SPO generated successfully', data: spo };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async detail(req) {
    try {
      const { id } = req.params;

      const spo = await SSalesPurchaseOrders.findByPk(id, {
        include: [
          {
            model: SSalesPurchaseOrderDetails,
            as: 'details',
            include: [{ model: SParts, as: 'part', attributes: ['part_number', 'part_name'] }]
          },
          {
            model: SCustomers,
            as: 'customer',
            attributes: ['id', 'name', 'customer_code']
          },
          {
            model: SSalesPurchaseRequests,
            as: 'spr',
            attributes: ['id', 'spr_number']
          },
          {
            model: SUsers,
            as: 'creator',
            attributes: ['id', 'email'],
            include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
          }
        ]
      });

      if (!spo) return { status: false, message: 'SPO not found', code: 404 };

      return { status: true, data: spo };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async update(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const data = req.body;
      const currentUser = req.user;

      const spo = await SSalesPurchaseOrders.findByPk(id, { transaction: t });
      if (!spo) {
        await t.rollback();
        return { status: false, message: 'SPO not found', code: 404 };
      }

      if (spo.status !== 'Draft') {
        await t.rollback();
        return { status: false, message: 'Only Draft SPO can be updated', code: 400 };
      }

      const detailSchema = Joi.object({
        part_id: Joi.number().integer().required(),
        ordered_qty: Joi.number().integer().min(1).required()
      });

      const schema = Joi.object({
        customer_id: Joi.number().integer().optional(),
        shipping_address: Joi.string().optional(),
        delivery_due_date: Joi.date().iso().optional(),
        details: Joi.array().items(detailSchema).optional()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const updates = validation.value;
      const oldData = JSON.parse(JSON.stringify(spo));

      await spo.update(updates, { transaction: t });

      if (updates.details) {
        await SSalesPurchaseOrderDetails.destroy({ where: { spo_id: spo.id }, transaction: t });
        const detailRecords = updates.details.map(d => ({
          spo_id: spo.id,
          part_id: d.part_id,
          ordered_qty: d.ordered_qty,
          sent_qty: 0,
          status: 'Open'
        }));
        await SSalesPurchaseOrderDetails.bulkCreate(detailRecords, { transaction: t });
      }

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'UPDATE_SPO',
        resourceId: spo.id,
        oldData,
        newData: spo,
        description: `Updated SPO ${spo.spo_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'SPO updated successfully' };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async delete(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;

      const spo = await SSalesPurchaseOrders.findByPk(id, { transaction: t });
      if (!spo) {
        await t.rollback();
        return { status: false, message: 'SPO not found', code: 404 };
      }

      if (spo.status !== 'Draft') {
        await t.rollback();
        return { status: false, message: 'Only Draft SPO can be deleted', code: 400 };
      }

      const oldData = JSON.parse(JSON.stringify(spo));

      await spo.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'DELETE_SPO',
        resourceId: id,
        oldData,
        description: `Deleted SPO ${spo.spo_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'SPO deleted successfully' };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // Update Status logic (Draft -> Submitted -> Locked / Rejected)
  async updateStatus(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;
      const currentUser = req.user;

      const spo = await SSalesPurchaseOrders.findByPk(id, { transaction: t });
      if (!spo) {
        await t.rollback();
        return { status: false, message: 'SPO not found', code: 404 };
      }

      const validStatuses = ['Submitted', 'Locked', 'Processing', 'Completed'];
      if (!validStatuses.includes(status)) {
        await t.rollback();
        return { status: false, message: 'Invalid status transition requested', code: 400 };
      }

      // Logic transitions
      if (status === 'Submitted' && spo.status !== 'Draft') {
        await t.rollback();
        return { status: false, message: 'Only Draft SPO can be submitted', code: 400 };
      }

      if (status === 'Locked' && spo.status !== 'Submitted') {
        await t.rollback();
        return { status: false, message: 'Only Submitted SPO can be Locked by Supervisor', code: 400 };
      }

      if ((status === 'Processing' || status === 'Completed') && !['Locked', 'Processing'].includes(spo.status)) {
        await t.rollback();
        return { status: false, message: 'Only Locked or Processing SPO can be updated to Processing/Completed', code: 400 };
      }

      const oldData = JSON.parse(JSON.stringify(spo));

      await spo.update({
        status,
        remarks: remarks || spo.remarks
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'UPDATE_SPO_STATUS',
        resourceId: spo.id,
        oldData,
        newData: spo,
        description: `Updated SPO ${spo.spo_number} status to ${status}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: `SPO status updated to ${status} successfully` };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async getSdoHistory(req) {
    try {
      const { id } = req.params; // SPO ID

      // Get the SPO with its details
      const spo = await SSalesPurchaseOrders.findByPk(id, {
        include: [
          {
            model: SSalesPurchaseOrderDetails,
            as: 'details',
            include: [{ model: SParts, as: 'part', attributes: ['part_number', 'part_name'] }]
          }
        ]
      });

      if (!spo) return { status: false, message: 'SPO not found', code: 404 };

      // To find SDOs related to this SPO, we trace through SDeliveryPlanDetails
      // SPO Details -> Delivery Plan Details -> Delivery Order Details -> Delivery Orders
      // Or simply: SDeliveryPlanDetails has spo_detail_id.
      // SDeliveryOrderDetails has delivery_plan_detail_id.

      const sdoDetails = await SDeliveryOrderDetails.findAll({
        include: [
          {
            model: SDeliveryPlanDetails,
            as: 'planDetail',
            required: true,
            include: [
              {
                model: SSalesPurchaseOrderDetails,
                as: 'spoDetail',
                where: { spo_id: id },
                required: true
              }
            ]
          },
          {
            model: SDeliveryOrders,
            as: 'deliveryOrder',
            required: true,
            attributes: ['id', 'do_number', 'do_date', 'status', 'received_at']
          }
        ]
      });

      // Aggregate SDO history
      const history = {};
      const deliveredQtyByPart = {};

      for (const d of sdoDetails) {
        const doId = d.deliveryOrder.id;
        const partId = d.planDetail.spoDetail.part_id;

        if (!history[doId]) {
          history[doId] = {
            id: doId,
            do_number: d.deliveryOrder.do_number,
            do_date: d.deliveryOrder.do_date,
            status: d.deliveryOrder.status,
            received_at: d.deliveryOrder.received_at,
            items: []
          };
        }

        history[doId].items.push({
          part_id: partId,
          qty: d.sent_qty // sent_qty or whatever quantity is recorded on DO detail
        });

        if (!deliveredQtyByPart[partId]) deliveredQtyByPart[partId] = 0;
        deliveredQtyByPart[partId] += d.sent_qty;
      }

      // Provide aggregation on the SPO parts
      const aggregation = spo.details.map(detail => ({
        part_id: detail.part_id,
        part_number: detail.part.part_number,
        part_name: detail.part.part_name,
        ordered_qty: detail.ordered_qty,
        delivered_qty: deliveredQtyByPart[detail.part_id] || 0,
        remaining_qty: detail.ordered_qty - (deliveredQtyByPart[detail.part_id] || 0)
      }));

      return {
        status: true,
        data: {
          spo_info: {
            id: spo.id,
            spo_number: spo.spo_number,
            status: spo.status
          },
          aggregation,
          sdo_history: Object.values(history)
        }
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

}

export default new SPOModule();
