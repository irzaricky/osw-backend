import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op, QueryTypes } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import PdfPrinter from 'pdfmake/src/printer.js';
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
  SVehicles, SCustomers, SParts, SUsers, SUserDetail,
  SPackages, RefVehicleType, SRoles, SWarehouseAreas,
  TWorkOrderStoring, TWorkOrderStoringItem
} = db;

class SDOModule extends BaseModule {
  async getDropdownVehicles(req) {
    try {
      const { date, time_start, time_end } = req.query;
      const where = { status: true };

      if (date && time_start && time_end) {
        const busyVehicles = await SDeliveryOrders.findAll({
          include: [{
            model: SDeliveryPlans,
            as: 'deliveryPlan',
            required: true,
            where: {
              scheduled_date: date,
              time_start: { [Op.lt]: time_end },
              time_end: { [Op.gt]: time_start }
            }
          }],
          where: {
            vehicle_id: { [Op.ne]: null },
            delivery_status: { [Op.notIn]: ['Cancelled'] }
          },
          attributes: ['vehicle_id'],
          raw: true
        });

        const busyVehicleIds = busyVehicles.map(v => v.vehicle_id);
        if (busyVehicleIds.length > 0) {
          where.id = { [Op.notIn]: busyVehicleIds };
        }
      }

      const data = await SVehicles.findAll({
        where,
        attributes: ['id', ['plate_number', 'license_plate'], 'vehicle_type_id'],
        include: [{
          model: RefVehicleType,
          as: 'vehicle_type',
          attributes: ['id', 'name', 'load_capacity']
        }],
        order: [['plate_number', 'ASC']]
      });
      return { status: true, data };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async getDropdownDrivers(req) {
    try {
      const { date, time_start, time_end } = req.query;
      const where = {};

      if (date && time_start && time_end) {
        const busyDrivers = await SDeliveryOrders.findAll({
          include: [{
            model: SDeliveryPlans,
            as: 'deliveryPlan',
            required: true,
            where: {
              scheduled_date: date,
              time_start: { [Op.lt]: time_end },
              time_end: { [Op.gt]: time_start }
            }
          }],
          where: {
            driver_id: { [Op.ne]: null },
            delivery_status: { [Op.notIn]: ['Cancelled'] }
          },
          attributes: ['driver_id'],
          raw: true
        });

        const busyDriverIds = busyDrivers.map(d => d.driver_id);
        if (busyDriverIds.length > 0) {
          where.user_id = { [Op.notIn]: busyDriverIds };
        }
      }

      const data = await SUserDetail.findAll({
        where,
        attributes: ['user_id', 'full_name', 'employee_number'],
        include: [{
          model: SUsers,
          as: 'user',
          attributes: ['id', 'email'],
          required: true,
          include: [{
            model: SRoles,
            as: 'role',
            attributes: ['id', 'name'],
            where: { name: { [Op.iLike]: 'Driver' } },
            required: true
          }]
        }],
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
      const { delivery_status, search, start_date, end_date, sort_by } = params;
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

      // Secure listing: If user is a driver, only show their own assigned SDOs
      if (req.user && req.user.role && req.user.role.toLowerCase() === 'driver') {
        where.driver_id = req.user.id;
      }

      const include = [
        { model: SCustomers, as: 'customer', attributes: ['id', 'name', 'customer_code'] },
        { model: SVehicles, as: 'vehicle', attributes: ['id', ['plate_number', 'license_plate']] },
        { model: SUserDetail, as: 'driver', attributes: ['user_id', 'full_name'] },
        { model: SDeliveryPlans, as: 'deliveryPlan', attributes: ['id', 'dp_number', 'scheduled_date', 'destination', 'time_end'] },
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

      const now = dayjs();
      rows.forEach(row => {
        let status = 'On Time';
        if (row.deliveryPlan) {
          const deadlineStr = `${row.deliveryPlan.scheduled_date}T${row.deliveryPlan.time_end}`;
          const deadline = dayjs(deadlineStr);
          if (row.delivery_status === 'Delivered') {
            const received = row.received_at ? dayjs(row.received_at) : null;
            if (received && received.isAfter(deadline)) {
              status = 'Delayed';
            }
          } else {
            if (now.isAfter(deadline)) {
              status = 'Delayed';
            } else if (now.isAfter(deadline.subtract(2, 'hour'))) {
              status = 'Near Expiry';
            }
          }
        }
        row.dataValues.sla_status = status;
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
          { model: SVehicles, as: 'vehicle', attributes: ['id', ['plate_number', 'license_plate']] },
          { model: SUserDetail, as: 'driver', attributes: ['user_id', 'full_name'] },
          { model: SDeliveryPlans, as: 'deliveryPlan', attributes: ['id', 'dp_number', 'scheduled_date', 'destination', 'time_end'] },
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

      // Secure access: If user is a driver, only allow access if they are assigned to this SDO
      if (req.user && req.user.role && req.user.role.toLowerCase() === 'driver') {
        if (sdo.driver_id !== req.user.id) {
          return { status: false, message: 'Forbidden: You are not assigned to this Delivery Order', code: 403 };
        }
      }

      let status = 'On Time';
      if (sdo.deliveryPlan) {
        const deadlineStr = `${sdo.deliveryPlan.scheduled_date}T${sdo.deliveryPlan.time_end}`;
        const deadline = dayjs(deadlineStr);
        if (sdo.delivery_status === 'Delivered') {
          const received = sdo.received_at ? dayjs(sdo.received_at) : null;
          if (received && received.isAfter(deadline)) {
            status = 'Delayed';
          }
        } else {
          const now = dayjs();
          if (now.isAfter(deadline)) {
            status = 'Delayed';
          } else if (now.isAfter(deadline.subtract(2, 'hour'))) {
            status = 'Near Expiry';
          }
        }
      }
      sdo.dataValues.sla_status = status;

      // Fetch related Take Out Work Orders
      const takeOutWorkOrders = await TWorkOrderStoring.findAll({
        where: {
          ref_doc_number: sdo.do_number,
          wo_category: 'Take Out'
        },
        include: [
          {
            model: TWorkOrderStoringItem,
            as: 'items',
            include: [
              { model: SParts, as: 'part', attributes: ['id', 'part_number', 'part_name'] }
            ]
          },
          {
            model: db.RefWorkOrderStoringStatus,
            as: 'status',
            attributes: ['id', 'name']
          },
          {
            model: SWarehouseAreas,
            as: 'area',
            attributes: ['id', 'name', 'area_code']
          }
        ],
        order: [['created_at', 'ASC']]
      });
      sdo.dataValues.take_out_wos = takeOutWorkOrders;

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

      // Load SDP with all details + SPO chain + parts + package
      const sdp = await SDeliveryPlans.findByPk(delivery_plan_id, {
        include: [
          {
            model: SDeliveryPlanDetails, as: 'details',
            include: [
              {
                model: SSalesPurchaseOrderDetails, as: 'spoDetail',
                include: [
                  { model: SSalesPurchaseOrders, as: 'order', attributes: ['id', 'customer_id'] },
                  {
                    model: SParts, as: 'part',
                    include: [{ model: SPackages, as: 'package' }]
                  }
                ]
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

      // Check vehicle exists and load type details
      const vehicle = await SVehicles.findByPk(vehicle_id, {
        include: [{ model: RefVehicleType, as: 'vehicle_type', attributes: ['id', 'name', 'load_capacity'] }],
        transaction: t
      });
      if (!vehicle) { await t.rollback(); return { status: false, message: 'Vehicle not found', code: 404 }; }

      // Check driver exists and verify Driver role
      const driver = await SUserDetail.findOne({
        where: { user_id: driver_id },
        include: [{
          model: SUsers,
          as: 'user',
          include: [{ model: SRoles, as: 'role', attributes: ['id', 'name'] }]
        }],
        transaction: t
      });
      if (!driver) { await t.rollback(); return { status: false, message: 'Driver not found', code: 404 }; }

      const roleName = driver.user?.role?.name;
      if (!roleName || roleName.toLowerCase() !== 'driver') {
        await t.rollback();
        return { status: false, message: 'The selected user is not registered as a Driver', code: 400 };
      }

      // Guard against overlapping driver or vehicle schedules
      const existingConflict = await SDeliveryOrders.findOne({
        include: [{
          model: SDeliveryPlans,
          as: 'deliveryPlan',
          required: true,
          where: {
            scheduled_date: sdp.scheduled_date,
            time_start: { [Op.lt]: sdp.time_end },
            time_end: { [Op.gt]: sdp.time_start }
          }
        }],
        where: {
          [Op.or]: [
            { vehicle_id },
            { driver_id }
          ]
        },
        transaction: t
      });

      if (existingConflict) {
        const isVehicleConflict = existingConflict.vehicle_id === vehicle_id;
        const conflictTarget = isVehicleConflict ? 'Vehicle' : 'Driver';
        await t.rollback();
        return {
          status: false,
          message: `${conflictTarget} is already allocated to another shipping schedule at this time slot (${existingConflict.deliveryPlan.time_start} - ${existingConflict.deliveryPlan.time_end})`,
          code: 409
        };
      }

      // Calculate and validate total package load factor
      let totalSdpLoad = 0;
      for (const planDetail of sdp.details) {
        const part = planDetail.spoDetail?.part;
        const pkg = part?.package;
        if (pkg) {
          const capacity = pkg.capacity || 1;
          const loadFactor = pkg.load !== null ? pkg.load : 1.0;
          const numPackages = Math.ceil(planDetail.planned_qty / capacity);
          totalSdpLoad += numPackages * loadFactor;
        } else {
          totalSdpLoad += planDetail.planned_qty;
        }
      }

      const maxCapacity = vehicle.vehicle_type ? vehicle.vehicle_type.load_capacity : 50;
      if (totalSdpLoad > maxCapacity) {
        await t.rollback();
        return {
          status: false,
          message: `Total package load (${totalSdpLoad.toFixed(1)} units) exceeds the selected vehicle's maximum load capacity (${maxCapacity} units)`,
          code: 400
        };
      }

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
        delivery_status: 'Created',
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

      // Group details by resolved warehouse area ID
      const detailsByArea = {};
      for (const planDetail of sdp.details) {
        const part = planDetail.spoDetail?.part;
        if (!part) continue;

        let areaId = null;

        // 1. Check existing warehouse stock location
        const stockArea = await db.sequelize.query(`
          SELECT a.id AS area_id
          FROM t_warehouse_stock ws
          JOIN s_warehouse_bins b ON b.id = ws.bin_id AND b.deleted_at IS NULL
          JOIN s_warehouse_areas a ON a.id = b.area_id AND a.deleted_at IS NULL
          JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id AND wil.deleted_at IS NULL
          JOIN t_part_labels pl ON pl.id = wil.label_id AND pl.deleted_at IS NULL
          WHERE pl.part_id = :part_id
            AND a.warehouse_id = :warehouse_id
          LIMIT 1
        `, {
          replacements: { part_id: part.id, warehouse_id: sdp.warehouse_id },
          type: QueryTypes.SELECT,
          transaction: t
        });

        if (stockArea && stockArea.length > 0) {
          areaId = stockArea[0].area_id;
        }

        // 2. Fallback to model name
        if (!areaId) {
          if (part.model_name === 'VOLT') {
            const area = await db.SWarehouseAreas.findOne({
              where: { warehouse_id: sdp.warehouse_id, area_code: 'AREA-VOLT' },
              transaction: t
            });
            if (area) areaId = area.id;
          } else if (part.model_name === 'ECO') {
            const area = await db.SWarehouseAreas.findOne({
              where: { warehouse_id: sdp.warehouse_id, area_code: 'AREA-ECO' },
              transaction: t
            });
            if (area) areaId = area.id;
          }
        }

        // 3. Absolute fallback to the first area in the warehouse
        if (!areaId) {
          const area = await db.SWarehouseAreas.findOne({
            where: { warehouse_id: sdp.warehouse_id },
            order: [['id', 'ASC']],
            transaction: t
          });
          if (area) areaId = area.id;
        }

        // Handle case where we still couldn't resolve any area
        if (!areaId) {
          throw new Error(`Could not resolve a warehouse area for part ${part.part_number} under warehouse ID ${sdp.warehouse_id}`);
        }

        const capacity = part.package?.capacity || 1;
        const totalKanban = Math.ceil(planDetail.planned_qty / capacity);

        if (!detailsByArea[areaId]) {
          detailsByArea[areaId] = [];
        }
        detailsByArea[areaId].push({
          part_id: part.id,
          total_kanban: totalKanban
        });
      }

      // Generate a Draft Take Out Work Order for each warehouse area represented in the DO details
      const dateStr = dayjs().format('YYMMDD');
      for (const areaIdStr in detailsByArea) {
        const areaId = Number(areaIdStr);
        const items = detailsByArea[areaId];

        // Generate a unique work order number with prefix 'WO-F-YYMMDD-' (Finish Goods)
        const woPrefix = `WO-F-${dateStr}-`;
        const lastWO = await TWorkOrderStoring.findOne({
          where: {
            wo_number: {
              [Op.like]: `${woPrefix}%`
            }
          },
          order: [['wo_number', 'DESC']],
          transaction: t
        });

        let nextNumber = 1;
        if (lastWO) {
          const lastSeq = parseInt(lastWO.wo_number.split('-').pop(), 10);
          if (!isNaN(lastSeq)) {
            nextNumber = lastSeq + 1;
          }
        }
        const woNumber = `${woPrefix}${String(nextNumber).padStart(3, '0')}`;

        // Create the Work Order
        const wo = await TWorkOrderStoring.create({
          wo_number: woNumber,
          wo_category: 'Take Out',
          ref_doc_id: null,
          ref_doc_number: sdo.do_number,
          ref_doc_name: 'Sales Delivery Order',
          wo_date: new Date(),
          wo_description: `Automatically generated for SDO ${sdo.do_number}`,
          wo_type_id: 3, // Finish Good
          warehouse_area_id: areaId,
          wo_status_id: 1, // Draft
          created_by: currentUser.id
        }, { transaction: t });

        // Bulk create the storing items
        const storingItems = items.map(item => ({
          wo_id: wo.id,
          part_id: item.part_id,
          total_kanban: item.total_kanban,
          is_scanned_in: false,
          is_scanned_out: false
        }));

        await TWorkOrderStoringItem.bulkCreate(storingItems, { transaction: t });
      }

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

  async uploadLoadingPhoto(req) {
    try {
      const { id } = req.params;
      const sdo = await SDeliveryOrders.findByPk(id);
      if (!sdo) return { status: false, message: 'Delivery Order not found', code: 404 };

      if (sdo.delivery_status !== 'Created') {
        return { status: false, message: 'Loading photo can only be uploaded when status is "Created"', code: 400 };
      }

      if (!req.files || !req.files.loading_photo) {
        return { status: false, message: 'Loading photo file is required', code: 400 };
      }

      const file = req.files.loading_photo;
      const ext = path.extname(file.name);
      const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
      if (!allowedExts.includes(ext.toLowerCase())) {
        return { status: false, message: 'Only Image files (.jpg, .jpeg, .png, .webp) are allowed for Loading photo', code: 400 };
      }

      const fileName = `loading_${Date.now()}${ext}`;
      const uploadDir = path.join(__dirname, '../../public/uploads/loading');

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const uploadPath = path.join(uploadDir, fileName);
      await file.mv(uploadPath);

      const loadingPhotoUrl = `/uploads/loading/${fileName}`;

      await sdo.update({
        loading_photo_url: loadingPhotoUrl,
        delivery_status: 'Loading'
      });

      return { status: true, message: 'Loading photo uploaded successfully and status updated to Loading', data: sdo };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async approveDispatch(req) {
    try {
      const { id } = req.params;
      const currentUser = req.user;

      if (currentUser.role !== 'Supervisor Sales' && currentUser.role !== 'Superadmin') {
        return { status: false, message: 'Forbidden: Only Supervisor Sales can approve dispatch', code: 403 };
      }

      const sdo = await SDeliveryOrders.findByPk(id);
      if (!sdo) return { status: false, message: 'Delivery Order not found', code: 404 };

      if (sdo.delivery_status !== 'Loading') {
        return { status: false, message: 'Dispatch can only be approved when status is "Loading"', code: 400 };
      }

      await sdo.update({
        dispatch_approved_by: currentUser.id,
        dispatch_approved_at: new Date()
      });

      return { status: true, message: 'Dispatch approved successfully', data: sdo };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async startDelivery(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const sdo = await SDeliveryOrders.findByPk(id, { transaction: t });
      if (!sdo) {
        await t.rollback();
        return { status: false, message: 'Delivery Order not found', code: 404 };
      }

      if (sdo.delivery_status !== 'Loading') {
        await t.rollback();
        return { status: false, message: 'Delivery can only be started when status is "Loading"', code: 400 };
      }

      if (!sdo.dispatch_approved_by) {
        await t.rollback();
        return { status: false, message: 'Cannot start delivery: Dispatch must be approved by a Supervisor first', code: 400 };
      }

      // Check if there are any Take Out Work Orders for this SDO that are not completed (wo_status_id !== 4)
      const incompleteTakeOut = await TWorkOrderStoring.findOne({
        where: {
          ref_doc_number: sdo.do_number,
          wo_category: 'Take Out',
          wo_status_id: { [Op.ne]: 4 }
        },
        transaction: t
      });

      if (incompleteTakeOut) {
        const { bypass } = req.body;
        const allowedBypassRoles = ['Admin sales', 'Superadmin', 'Supervisor Sales'];
        const isAuthorized = req.user && req.user.role && allowedBypassRoles.includes(req.user.role);

        if (bypass === true) {
          if (!isAuthorized) {
            await t.rollback();
            return {
              status: false,
              message: 'Forbidden: You are not authorized to bypass the Take Out validation. Only Admin sales, Superadmin, or Supervisor Sales can bypass.',
              code: 403
            };
          }
        } else {
          await t.rollback();
          return {
            status: false,
            require_bypass: true,
            message: 'Cannot start delivery: Take Out items are not completed yet.',
            code: 400
          };
        }
      }

      await sdo.update({
        delivery_status: 'In Transit'
      }, { transaction: t });

      if (sdo.vehicle_id) {
        await SVehicles.update({
          availability_status: 'In Transit'
        }, {
          where: { id: sdo.vehicle_id },
          transaction: t
        });
      }

      await t.commit();
      return { status: true, message: 'Delivery started and status updated to In Transit', data: sdo };
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
      const currentUser = req.user;

      const sdo = await SDeliveryOrders.findByPk(id, {
        include: [
          { model: SDeliveryPlans, as: 'deliveryPlan', attributes: ['id', 'dp_number', 'warehouse_id'] },
          {
            model: SDeliveryOrderDetails,
            as: 'details',
            include: [
              {
                model: SDeliveryPlanDetails,
                as: 'planDetail',
                include: [
                  {
                    model: SSalesPurchaseOrderDetails,
                    as: 'spoDetail',
                    include: [
                      { model: SParts, as: 'part', attributes: ['id', 'part_number', 'part_name', 'package_id'] },
                      { model: SSalesPurchaseOrders, as: 'order', attributes: ['id', 'status', 'spo_number'] }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        transaction: t
      });

      if (!sdo) {
        await t.rollback();
        return { status: false, message: 'Delivery Order not found', code: 404 };
      }

      // Secure update status: If user is a driver, they must be the assigned driver for this SDO
      if (currentUser && currentUser.role && currentUser.role.toLowerCase() === 'driver') {
        if (sdo.driver_id !== currentUser.id) {
          await t.rollback();
          return { status: false, message: 'Forbidden: You are not assigned to this Delivery Order', code: 403 };
        }
      }

      if (sdo.delivery_status !== 'In Transit') {
        await t.rollback();
        return { status: false, message: 'Only "In Transit" Delivery Orders can be confirmed as Delivered', code: 400 };
      }

      // Enforce Proof of Delivery (POD) file is uploaded
      if (!req.files || !req.files.proof_of_delivery) {
        await t.rollback();
        return { status: false, message: 'Proof of Delivery (POD) file is required', code: 400 };
      }

      // Parse details if it is stringified JSON (from multipart/form-data)
      if (typeof req.body.details === 'string') {
        try {
          req.body.details = JSON.parse(req.body.details);
        } catch (e) {
          // ignore
        }
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
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { notes, details } = validation.value;

      // Handle proof_of_delivery file upload (supporting single or multiple files)
      const podFiles = Array.isArray(req.files.proof_of_delivery)
        ? req.files.proof_of_delivery
        : [req.files.proof_of_delivery];

      const uploadDir = path.join(__dirname, '../../public/uploads/pod');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      const proofUrls = [];
      for (let i = 0; i < podFiles.length; i++) {
        const file = podFiles[i];
        const ext = path.extname(file.name);
        const fileName = `${sdo.do_number.replace(/\//g, '-')}_${Date.now()}_${i}${ext}`;
        const uploadPath = path.join(uploadDir, fileName);
        await file.mv(uploadPath);
        proofUrls.push(`/uploads/pod/${fileName}`);
      }
      // Update each detail's received_qty and notes, validating bounds
      for (const item of details) {
        const doDetail = sdo.details.find(d => d.id === item.delivery_order_detail_id);

        if (!doDetail) {
          await t.rollback();
          return {
            status: false,
            message: `Delivery Order Detail ID ${item.delivery_order_detail_id} not found or does not belong to this SDO`,
            code: 404
          };
        }

        // Validate received_qty <= sent_qty
        if (item.received_qty > doDetail.sent_qty) {
          await t.rollback();
          return {
            status: false,
            message: `Received quantity (${item.received_qty}) cannot exceed sent quantity (${doDetail.sent_qty}) for detail ID ${item.delivery_order_detail_id}`,
            code: 400
          };
        }

        await doDetail.update({
          received_qty: item.received_qty,
          notes: item.notes ?? doDetail.notes
        }, { transaction: t });

        /*
        // AUTOMATED FIFO STOCK DEDUCTION
        const part = doDetail.planDetail?.spoDetail?.part;
        if (!part) continue;

        const packageData = part.package_id
          ? await db.SPackages.findByPk(part.package_id, { attributes: ['id', 'capacity'], transaction: t })
          : null;
        const capacity = packageData?.capacity || 1;
        const requiredKanbans = Math.ceil(doDetail.sent_qty / capacity);

        // Find available stock for the part in the Finish Good warehouse of origin
        const fifoStocks = await db.sequelize.query(`
          SELECT
            ws.id AS stock_id,
            ws.wo_item_label_id,
            ws.bin_id,
            pl.id AS label_id,
            pl.label_number
          FROM t_warehouse_stock ws
          JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
          JOIN t_part_labels pl ON pl.id = wil.label_id
          JOIN s_warehouse_bins b ON b.id = ws.bin_id
          JOIN s_warehouse_areas a ON a.id = b.area_id
          WHERE pl.part_id = :part_id
            AND a.warehouse_id = :warehouse_id
          ORDER BY ws.created_at ASC, ws.id ASC
          LIMIT :limit
          FOR UPDATE
        `, {
          replacements: {
            part_id: part.id,
            warehouse_id: sdo.deliveryPlan.warehouse_id,
            limit: requiredKanbans
          },
          type: QueryTypes.SELECT,
          transaction: t
        });

        if (fifoStocks.length < requiredKanbans) {
          await t.rollback();
          return {
            status: false,
            message: `Insufficient stock in Finished Goods warehouse for part "${part.part_number}". Required: ${requiredKanbans} kanbans (${doDetail.sent_qty} pcs), available: ${fifoStocks.length} kanbans.`,
            code: 400
          };
        }

        // Deduct target stock records and write audit log
        for (const row of fifoStocks) {
          await db.sequelize.query(`
            DELETE FROM t_warehouse_stock
            WHERE id = :stock_id
          `, {
            replacements: { stock_id: row.stock_id },
            type: QueryTypes.DELETE,
            transaction: t
          });

          await db.sequelize.query(`
            INSERT INTO t_warehouse_stock_log (
              wh_stock_id,
              user_id,
              is_placement,
              qty_per_kanban,
              old_data,
              created_at,
              updated_at
            )
            VALUES (
              :wh_stock_id,
              :user_id,
              false,
              :qty_per_kanban,
              :old_data,
              NOW(),
              NOW()
            )
          `, {
            replacements: {
              wh_stock_id: row.stock_id,
              user_id: currentUser.id || null,
              qty_per_kanban: capacity,
              old_data: JSON.stringify({
                reason: 'SDO Shipment Delivered',
                sdo_number: sdo.do_number,
                part_number: part.part_number,
                qty: doDetail.sent_qty,
                bin_id: row.bin_id,
                label_number: row.label_number
              })
            },
            type: QueryTypes.INSERT,
            transaction: t
          });
        }
        */
      }

      const oldData = JSON.parse(JSON.stringify(sdo));

      // Check if partial delivery
      let isPartial = false;
      for (const item of details) {
        const doDetail = sdo.details.find(d => d.id === item.delivery_order_detail_id);
        if (doDetail && item.received_qty < doDetail.sent_qty) {
          isPartial = true;
          break;
        }
      }

      const finalStatus = isPartial ? 'Delivered (Partial)' : 'Delivered';

      // Update SDO header to Delivered or Delivered (Partial)
      await sdo.update({
        delivery_status: finalStatus,
        notes: notes ?? sdo.notes,
        proof_of_delivery: proofUrls,
        received_at: new Date()
      }, { transaction: t });

      if (sdo.vehicle_id) {
        await SVehicles.update({
          availability_status: 'Available'
        }, {
          where: { id: sdo.vehicle_id },
          transaction: t
        });
      }

      // Transition parent SPOs from Locked to Processing when SDO finishes
      const spoIds = new Set();
      sdo.details.forEach(detail => {
        const spo = detail.planDetail?.spoDetail?.order;
        if (spo) {
          spoIds.add(spo.id);
        }
      });

      for (const spoId of spoIds) {
        const spoObj = await SSalesPurchaseOrders.findByPk(spoId, { transaction: t });
        if (spoObj && spoObj.status === 'Locked') {
          await spoObj.update({ status: 'Processing' }, { transaction: t });
        }
      }

      // Check if all SDOs for this SDP are Delivered → mark SDP as Shipped
      const pendingSDOs = await SDeliveryOrders.count({
        where: {
          delivery_plan_id: sdo.delivery_plan_id,
          delivery_status: { [Op.notIn]: ['Delivered', 'Delivered (Partial)'] }
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

  // ─── GENERATE SURAT JALAN PDF (Print Delivery Order) ─────────────────────

  async printSuratJalan(req, res) {
    try {
      const { id } = req.params;

      const sdo = await SDeliveryOrders.findByPk(id, {
        include: [
          { model: SCustomers, as: 'customer', attributes: ['id', 'name', 'customer_code'] },
          { model: SVehicles, as: 'vehicle', attributes: ['id', ['plate_number', 'license_plate']] },
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
                    include: [
                      { model: SParts, as: 'part', attributes: ['id', 'part_number', 'part_name'] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!sdo) {
        return res.status(404).json({
          status: false,
          message: 'Delivery Order not found'
        });
      }

      // Update parent SDP status to Shipped when printed
      if (sdo.delivery_plan_id) {
        await SDeliveryPlans.update(
          { status: 'Shipped' },
          { where: { id: sdo.delivery_plan_id } }
        );
      }

      const printedAt = dayjs().format('DD/MM/YYYY HH:mm:ss');

      const fonts = {
        Roboto: {
          normal: path.resolve('fonts/Roboto-Regular.ttf'),
          bold: path.resolve('fonts/Roboto-Medium.ttf'),
          bolditalics: path.resolve('fonts/Roboto-MediumItalic.ttf')
        }
      };

      const printer = new PdfPrinter(fonts);

      // Build items table body
      const tableBody = [
        [
          { text: 'No.', style: 'tableHeader', alignment: 'center' },
          { text: 'Part Number', style: 'tableHeader' },
          { text: 'Part Name', style: 'tableHeader' },
          { text: 'Sent Qty', style: 'tableHeader', alignment: 'right' },
          { text: 'Received Qty', style: 'tableHeader', alignment: 'center' },
          { text: 'Notes', style: 'tableHeader' }
        ]
      ];

      if (sdo.details && sdo.details.length > 0) {
        sdo.details.forEach((item, index) => {
          const part = item.planDetail?.spoDetail?.part;
          tableBody.push([
            { text: String(index + 1), alignment: 'center', style: 'tableCell' },
            { text: part?.part_number || '-', style: 'tableCellHighlight' },
            { text: part?.part_name || '-', style: 'tableCell' },
            { text: `${item.sent_qty} pcs`, alignment: 'right', style: 'tableCellHighlight' },
            { text: '', alignment: 'center', style: 'tableCell' }, // Left blank for physical signing/recording
            { text: item.notes || '', style: 'tableCell' }
          ]);
        });
      } else {
        tableBody.push([
          { text: 'No items found in this Delivery Order', colSpan: 6, alignment: 'center', style: 'tableCell' },
          {}, {}, {}, {}, {}
        ]);
      }

      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [36, 36, 36, 36],
        content: [
          // Header company details
          {
            columns: [
              {
                width: '*',
                stack: [
                  { text: 'PT. OWS LOGISTICS & DISTRIBUTION', style: 'companyName' },
                  { text: 'Kawasan Industri Cikarang Blok B-12, Bekasi, Jawa Barat', style: 'companyAddress' },
                  { text: 'Phone: (021) 8900-1234 | Email: dispatch@ows.co.id', style: 'companyAddress' }
                ]
              },
              {
                width: 'auto',
                stack: [
                  { text: 'DELIVERY NOTE', style: 'docTitle', alignment: 'right' },
                  { text: 'DELIVERY ORDER', style: 'docSubTitle', alignment: 'right' }
                ]
              }
            ],
            margin: [0, 0, 0, 15]
          },
          // Divider Line
          {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 1.5, lineColor: '#1a237e' }],
            margin: [0, 0, 0, 15]
          },
          // Metadata grid
          {
            columns: [
              {
                width: '50%',
                table: {
                  widths: ['35%', '*'],
                  body: [
                    [{ text: 'DO Number', style: 'metaLabel' }, { text: `: ${sdo.do_number}`, style: 'metaValueBold' }],
                    [{ text: 'Date', style: 'metaLabel' }, { text: `: ${dayjs(sdo.shipment_date).format('DD MMMM YYYY')}`, style: 'metaValue' }],
                    [{ text: 'Plan Ref', style: 'metaLabel' }, { text: `: ${sdo.deliveryPlan?.dp_number || '-'}`, style: 'metaValue' }],
                    [{ text: 'Driver', style: 'metaLabel' }, { text: `: ${sdo.driver?.full_name || '-'}`, style: 'metaValue' }],
                    [{ text: 'Vehicle Plate', style: 'metaLabel' }, { text: `: ${sdo.vehicle?.license_plate || '-'}`, style: 'metaValueBold' }]
                  ]
                },
                layout: 'noBorders'
              },
              {
                width: '50%',
                table: {
                  widths: ['30%', '*'],
                  body: [
                    [{ text: 'Deliver To', style: 'metaLabel' }, { text: `: ${sdo.customer?.name || '-'}`, style: 'metaValueBold' }],
                    [{ text: 'Cust Code', style: 'metaLabel' }, { text: `: ${sdo.customer?.customer_code || '-'}`, style: 'metaValue' }],
                    [{ text: 'Address', style: 'metaLabel' }, { text: `: ${sdo.deliveryPlan?.destination || '-'}`, style: 'metaValue' }]
                  ]
                },
                layout: 'noBorders'
              }
            ],
            margin: [0, 0, 0, 20]
          },
          // Table Title
          { text: 'SHIPMENT ITEMS LIST', style: 'sectionTitle', margin: [0, 0, 0, 8] },
          // Items Table
          {
            table: {
              headerRows: 1,
              widths: ['7%', '20%', '35%', '13%', '13%', '12%'],
              body: tableBody
            },
            layout: {
              hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
              vLineWidth: () => 0,
              hLineColor: (i, node) => (i === 0 || i === node.table.body.length) ? '#1a237e' : '#e0e0e0',
              paddingTop: () => 6,
              paddingBottom: () => 6,
              paddingLeft: () => 8,
              paddingRight: () => 8
            },
            margin: [0, 0, 0, 30]
          },
          // Signatures block
          {
            columns: [
              {
                width: '33%',
                stack: [
                  { text: 'Prepared By,', style: 'sigLabel', alignment: 'center' },
                  { text: '', margin: [0, 35, 0, 0] },
                  { text: '( Logistics Staff )', style: 'sigName', alignment: 'center' }
                ]
              },
              {
                width: '34%',
                stack: [
                  { text: 'Driver,', style: 'sigLabel', alignment: 'center' },
                  { text: '', margin: [0, 35, 0, 0] },
                  { text: `( ${sdo.driver?.full_name || '___________'} )`, style: 'sigName', alignment: 'center' }
                ]
              },
              {
                width: '33%',
                stack: [
                  { text: 'Received By,', style: 'sigLabel', alignment: 'center' },
                  { text: '', margin: [0, 35, 0, 0] },
                  { text: '( Customer Representative )', style: 'sigName', alignment: 'center' }
                ]
              }
            ]
          }
        ],
        footer: (currentPage, pageCount) => {
          return {
            columns: [
              { text: `Printed: ${printedAt} | Powered by OSW v1.0`, style: 'footerLeft', margin: [36, 0, 0, 0] },
              { text: `Page ${currentPage} of ${pageCount}`, style: 'footerRight', alignment: 'right', margin: [0, 0, 36, 0] }
            ],
            style: 'footer'
          };
        },
        styles: {
          companyName: { fontSize: 13, bold: true, color: '#1a237e' },
          companyAddress: { fontSize: 8, color: '#616161', margin: [0, 2, 0, 0] },
          docTitle: { fontSize: 18, bold: true, color: '#1a237e' },
          docSubTitle: { fontSize: 10, bold: true, color: '#757575', margin: [0, 2, 0, 0] },
          metaLabel: { fontSize: 9, bold: true, color: '#424242' },
          metaValue: { fontSize: 9, color: '#212121' },
          metaValueBold: { fontSize: 9, bold: true, color: '#1a237e' },
          sectionTitle: { fontSize: 10, bold: true, color: '#1a237e', tracking: 1 },
          tableHeader: { fontSize: 9, bold: true, color: '#ffffff', fillColor: '#1a237e', margin: [0, 2, 0, 2] },
          tableCell: { fontSize: 9, color: '#212121' },
          tableCellHighlight: { fontSize: 9, bold: true, color: '#1a237e' },
          sigLabel: { fontSize: 9, bold: true, color: '#424242' },
          sigName: { fontSize: 9, bold: true, color: '#212121' },
          footer: { fontSize: 7, color: '#9e9e9e' }
        },
        defaultStyle: {
          font: 'Roboto'
        }
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename=Delivery-Note-${sdo.do_number}.pdf`
      );

      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (error) {
      console.error('Error generating Surat Jalan PDF:', error);
      res.status(500).json({
        status: false,
        message: 'Internal server error while generating PDF'
      });
    }
  }
}

export default new SDOModule();
