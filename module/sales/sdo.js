import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import dayjs from 'dayjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  SDeliveryOrders, SDeliveryOrderDetails,
  SDeliveryPlans, SDeliveryPlanDetails,
  SSalesPurchaseOrders, SSalesPurchaseOrderDetails,
  SVehicles, SCustomers, SParts, SUsers, SUserDetail
} = db;

class SDOModule extends BaseModule {
  async getDropdownVehicles(req) {
    try {
      const data = await SVehicles.findAll({
        attributes: ['id', 'license_plate', 'vehicle_type_id'],
        order: [['license_plate', 'ASC']]
      });
      return { status: true, data };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async getDropdownDrivers(req) {
    try {
      const data = await SUserDetail.findAll({
        attributes: ['user_id', 'full_name', 'employee_number'],
        include: [{ model: SUsers, as: 'user', attributes: ['id', 'email'] }],
        order: [['full_name', 'ASC']]
      });
      return { status: true, data };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async list(req) {
    try {
      const params = req.query;
      const { delivery_status, search, start_date, end_date } = params;
      const { limit, page, offset } = helper.getPagination(params);

      const where = {};
      if (delivery_status) where.delivery_status = delivery_status;
      if (start_date && end_date) {
        where.shipment_date = { [Op.between]: [start_date, end_date] };
      }
      if (search) {
        where[Op.or] = [
          { do_number: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const include = [
        { model: SCustomers, as: 'customer', attributes: ['id', 'name', 'customer_code'] },
        { model: SVehicles, as: 'vehicle', attributes: ['id', 'license_plate'] },
        { model: SUserDetail, as: 'driver', attributes: ['user_id', 'full_name'] },
        { model: SDeliveryPlans, as: 'deliveryPlan', attributes: ['id', 'dp_number', 'scheduled_date'] },
        {
          model: SUsers, as: 'creator', attributes: ['id', 'email'],
          include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
        }
      ];

      const { count, rows } = await SDeliveryOrders.findAndCountAll({
        where, include, limit, offset,
        order: [['created_at', 'DESC']],
        distinct: true
      });

      return { status: true, data: helper.getPaginationData(rows, count, page, limit) };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async detail(req) {
    try {
      const { id } = req.params;
      const sdo = await SDeliveryOrders.findByPk(id, {
        include: [
          { model: SCustomers, as: 'customer', attributes: ['id', 'name', 'customer_code'] },
          { model: SVehicles, as: 'vehicle', attributes: ['id', 'license_plate'] },
          { model: SUserDetail, as: 'driver', attributes: ['user_id', 'full_name'] },
          { model: SDeliveryPlans, as: 'deliveryPlan', attributes: ['id', 'dp_number', 'scheduled_date', 'destination'] },
          {
            model: SUsers, as: 'creator', attributes: ['id', 'email'],
            include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
          },
          {
            model: SDeliveryOrderDetails, as: 'details',
            include: [
              {
                model: SDeliveryPlanDetails, as: 'planDetail',
                include: [
                  {
                    model: SSalesPurchaseOrderDetails, as: 'spoDetail',
                    include: [{ model: SParts, as: 'part', attributes: ['id', 'part_number', 'part_name'] }]
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!sdo) return { status: false, message: 'Delivery Order not found', code: 404 };
      return { status: true, data: sdo };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async _generateDONumber(transaction) {
    const prefix = `SDO-${dayjs().format('YYYY-MM')}`;
    const last = await SDeliveryOrders.findOne({
      where: { do_number: { [Op.like]: `${prefix}-%` } },
      order: [['do_number', 'DESC']],
      transaction, paranoid: false
    });
    let seq = 1;
    if (last) {
      const parts = last.do_number.split('-');
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n)) seq = n + 1;
    }
    return `${prefix}-${seq.toString().padStart(3, '0')}`;
  }

  async create(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;
      const currentUser = req.user;

      const schema = Joi.object({
        delivery_plan_id: Joi.number().integer().required(),
        vehicle_id: Joi.number().integer().required(),
        driver_id: Joi.number().integer().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) { await t.rollback(); return validation; }

      const { delivery_plan_id, vehicle_id, driver_id } = validation.value;

      // Load SDP with all details + SPO chain to get customer_id
      const sdp = await SDeliveryPlans.findByPk(delivery_plan_id, {
        include: [
          {
            model: SDeliveryPlanDetails, as: 'details',
            include: [
              {
                model: SSalesPurchaseOrderDetails, as: 'spoDetail',
                include: [{ model: SSalesPurchaseOrders, as: 'order', attributes: ['id', 'customer_id'] }]
              }
            ]
          }
        ],
        transaction: t
      });

      if (!sdp) { await t.rollback(); return { status: false, message: 'Delivery Plan not found', code: 404 }; }

      if (!['Draft', 'Scheduled'].includes(sdp.status)) {
        await t.rollback();
        return { status: false, message: `Delivery Plan status "${sdp.status}" cannot be executed into a Delivery Order`, code: 400 };
      }

      if (!sdp.details || sdp.details.length === 0) {
        await t.rollback();
        return { status: false, message: 'Delivery Plan has no detail items', code: 400 };
      }

      // Check vehicle exists
      const vehicle = await SVehicles.findByPk(vehicle_id, { transaction: t });
      if (!vehicle) { await t.rollback(); return { status: false, message: 'Vehicle not found', code: 404 }; }

      // Check driver exists (driver_id references s_users_details.user_id)
      const driver = await SUserDetail.findOne({ where: { user_id: driver_id }, transaction: t });
      if (!driver) { await t.rollback(); return { status: false, message: 'Driver not found', code: 404 }; }

      // Extract customer_id from the first detail's SPO
      const customer_id = sdp.details[0]?.spoDetail?.order?.customer_id;
      if (!customer_id) {
        await t.rollback();
        return { status: false, message: 'Could not determine customer from Delivery Plan details', code: 400 };
      }

      const do_number = await this._generateDONumber(t);

      const sdo = await SDeliveryOrders.create({
        do_number,
        delivery_plan_id: sdp.id,
        customer_id,
        vehicle_id,
        driver_id,
        shipment_date: dayjs().format('YYYY-MM-DD'),
        delivery_status: 'In Transit',
        created_by: currentUser.id
      }, { transaction: t });

      // Copy SDP details → SDO details (sent_qty = planned_qty)
      const sdoDetailRecords = sdp.details.map(planDetail => ({
        delivery_order_id: sdo.id,
        delivery_plan_detail_id: planDetail.id,
        sent_qty: planDetail.planned_qty,
        received_qty: null,
        notes: null
      }));
      await SDeliveryOrderDetails.bulkCreate(sdoDetailRecords, { transaction: t });

      // Update SDP status → Scheduled
      await sdp.update({ status: 'Scheduled' }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'CREATE_SDO',
        resourceId: sdo.id,
        newData: sdo,
        description: `Created Delivery Order ${do_number} from plan ${sdp.dp_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'Delivery Order created successfully', data: sdo };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ─── UPDATE STATUS (In Transit → Delivered + POD) ────────────────────────

  async updateStatus(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;

      const sdo = await SDeliveryOrders.findByPk(id, {
        include: [{ model: SDeliveryPlans, as: 'deliveryPlan', attributes: ['id', 'dp_number'] }],
        transaction: t
      });
      if (!sdo) { await t.rollback(); return { status: false, message: 'Delivery Order not found', code: 404 }; }

      if (sdo.delivery_status !== 'In Transit') {
        await t.rollback();
        return { status: false, message: 'Only "In Transit" Delivery Orders can be confirmed as Delivered', code: 400 };
      }

      // Validate and parse details from body
      const detailSchema = Joi.object({
        delivery_order_detail_id: Joi.number().integer().required(),
        received_qty: Joi.number().integer().min(0).required(),
        notes: Joi.string().allow('', null).optional()
      });

      const schema = Joi.object({
        notes: Joi.string().allow('', null).optional(),
        details: Joi.array().items(detailSchema).min(1).required()
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) { await t.rollback(); return validation; }

      const { notes, details } = validation.value;

      // Handle proof_of_delivery file upload
      let proofUrl = null;
      if (req.files && req.files.proof_of_delivery) {
        const file = req.files.proof_of_delivery;
        const ext = path.extname(file.name);
        const fileName = `${sdo.do_number.replace(/\//g, '-')}_${Date.now()}${ext}`;
        const uploadDir = path.join(__dirname, '../../public/uploads/pod');

        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const uploadPath = path.join(uploadDir, fileName);
        await file.mv(uploadPath);

        proofUrl = `/uploads/pod/${fileName}`;
      }

      // Update each detail's received_qty and notes
      for (const item of details) {
        const doDetail = await SDeliveryOrderDetails.findOne({
          where: { id: item.delivery_order_detail_id, delivery_order_id: sdo.id },
          transaction: t
        });

        if (!doDetail) {
          await t.rollback();
          return {
            status: false,
            message: `Delivery Order Detail ID ${item.delivery_order_detail_id} not found or does not belong to this SDO`,
            code: 404
          };
        }

        await doDetail.update({
          received_qty: item.received_qty,
          notes: item.notes ?? doDetail.notes
        }, { transaction: t });
      }

      const oldData = JSON.parse(JSON.stringify(sdo));

      // Update SDO header
      await sdo.update({
        delivery_status: 'Delivered',
        notes: notes ?? sdo.notes,
        proof_of_delivery: proofUrl ?? sdo.proof_of_delivery,
        received_at: new Date()
      }, { transaction: t });

      // Check if all SDOs for this SDP are Delivered → mark SDP as Shipped
      const pendingSDOs = await SDeliveryOrders.count({
        where: {
          delivery_plan_id: sdo.delivery_plan_id,
          delivery_status: { [Op.ne]: 'Delivered' }
        },
        transaction: t
      });

      if (pendingSDOs === 0 && sdo.deliveryPlan) {
        await SDeliveryPlans.update(
          { status: 'Shipped' },
          { where: { id: sdo.delivery_plan_id }, transaction: t }
        );
      }

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'DELIVER_SDO',
        resourceId: sdo.id,
        oldData,
        newData: sdo,
        description: `Delivery Order ${sdo.do_number} marked as Delivered`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'Delivery Order confirmed as Delivered successfully' };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }
}

export default new SDOModule();
