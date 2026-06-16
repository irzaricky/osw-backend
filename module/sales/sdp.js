import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import dayjs from 'dayjs';

const {
  SDeliveryPlans, SDeliveryPlanDetails,
  SSalesPurchaseOrders, SSalesPurchaseOrderDetails,
  SWarehouses, SDocks, SCustomers, SParts, SUsers, SUserDetail,
  SWarehouseAreas, RefWarehouseCategories, SPackages,
  SVehicles, RefVehicleType
} = db;

class SDPModule extends BaseModule {
  async getDropdownWarehouses(req) {
    try {
      const data = await SWarehouses.findAll({
        attributes: ['id', 'name', ['warehouse_code', 'code']],
        include: [{
          model: RefWarehouseCategories,
          as: 'category',
          attributes: ['id', 'name'],
          where: { name: 'Finish Good' }
        }],
        order: [['name', 'ASC']]
      });
      return { status: true, data };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async getDropdownDocks(req) {
    try {
      const include = [{
        model: SWarehouseAreas,
        as: 'area',
        attributes: ['id', 'warehouse_id'],
        include: [{
          model: SWarehouses,
          as: 'warehouse',
          attributes: ['id', 'name'],
          include: [{
            model: RefWarehouseCategories,
            as: 'category',
            attributes: ['id', 'name'],
            where: { name: 'Finish Good' }
          }]
        }]
      }];
      
      const where = {};
      if (req.query.warehouse_id) {
        where['$area.warehouse_id$'] = req.query.warehouse_id;
      }
      
      const docks = await SDocks.findAll({
        include,
        where,
        attributes: ['id', 'name', 'area_id'],
        order: [['name', 'ASC']]
      });
      
      const data = docks.map(d => ({
        id: d.id,
        name: d.name,
        area_id: d.area_id,
        warehouse_id: d.area?.warehouse_id || null
      }));
      
      return { status: true, data };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * Returns SPO detail items ready for delivery, with remaining_qty.
   * SPO must be Locked or Processing.
   */
  async getAvailableSpoItems(req) {
    try {
      const { spo_id } = req.query;
      const whereOrder = { status: { [Op.in]: ['Locked', 'Processing'] } };
      if (spo_id) whereOrder.id = spo_id;

      const spoDetails = await SSalesPurchaseOrderDetails.findAll({
        attributes: {
          include: [
            [
              db.sequelize.literal(`(
                SELECT COALESCE(SUM(dpd.planned_qty), 0)
                FROM s_delivery_plan_details dpd
                INNER JOIN s_delivery_plans dp
                  ON dp.id = dpd.delivery_plan_id AND dp.deleted_at IS NULL
                WHERE dpd.spo_detail_id = "SSalesPurchaseOrderDetails"."id"
                  AND dpd.deleted_at IS NULL
              )`),
              'total_planned_qty'
            ],
            [
              db.sequelize.literal(`(
                SELECT COALESCE(COUNT(ws.id) * COALESCE(MAX(pk.capacity), 1), 0)
                FROM t_warehouse_stock ws
                INNER JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id AND wil.deleted_at IS NULL
                INNER JOIN t_part_labels pl ON pl.id = wil.label_id AND pl.deleted_at IS NULL
                INNER JOIN s_parts p ON p.id = pl.part_id AND p.deleted_at IS NULL
                LEFT JOIN s_packages pk ON pk.id = p.package_id AND pk.deleted_at IS NULL
                WHERE p.id = "SSalesPurchaseOrderDetails"."part_id"
                  AND ws.deleted_at IS NULL
              )`),
              'stock_qty'
            ]
          ]
        },
        include: [
          {
            model: SSalesPurchaseOrders,
            as: 'order',
            where: whereOrder,
            attributes: ['id', 'spo_number', 'customer_id', 'delivery_due_date', 'shipping_address'],
            include: [{ model: SCustomers, as: 'customer', attributes: ['id', 'name'] }]
          },
          {
            model: SParts,
            as: 'part',
            attributes: ['id', 'part_number', 'part_name', 'package_id'],
            include: [
              {
                model: SPackages,
                as: 'package',
                attributes: ['id', 'name', 'capacity', 'load']
              }
            ]
          }
        ]
      });

      const results = spoDetails
        .map(d => {
          const json = d.toJSON();
          const totalPlanned = parseInt(json.total_planned_qty) || 0;
          const stockQty = parseInt(json.stock_qty) || 0;
          return {
            ...json,
            total_planned_qty: totalPlanned,
            remaining_qty: json.ordered_qty - totalPlanned,
            stock_qty: stockQty
          };
        })
        .filter(d => d.remaining_qty > 0);

      return { status: true, data: results };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async _calculateTotalLoad(details, transaction) {
    let totalLoad = 0;
    for (const item of details) {
      const spoDetail = await SSalesPurchaseOrderDetails.findByPk(item.spo_detail_id, {
        include: [{
          model: SParts,
          as: 'part',
          include: [{
            model: SPackages,
            as: 'package'
          }]
        }],
        transaction
      });

      if (spoDetail && spoDetail.part) {
        const part = spoDetail.part;
        const pkg = part.package;
        const planned_qty = item.planned_qty;

        if (pkg && pkg.capacity && pkg.capacity > 0 && pkg.load !== null && pkg.load !== undefined) {
          const num_packages = Math.ceil(planned_qty / pkg.capacity);
          totalLoad += num_packages * pkg.load;
        } else {
          totalLoad += planned_qty;
        }
      } else {
        totalLoad += item.planned_qty;
      }
    }
    return totalLoad;
  }

  async _getMaxCapacityValue(transaction) {
    const maxActive = await SVehicles.findOne({
      where: { status: true },
      include: [{
        model: RefVehicleType,
        as: 'vehicle_type',
        required: true
      }],
      order: [[{ model: RefVehicleType, as: 'vehicle_type' }, 'load_capacity', 'DESC']],
      transaction
    });

    let maxCapacity = 100;
    if (maxActive) {
      maxCapacity = maxActive.vehicle_type.load_capacity;
    } else {
      const maxType = await RefVehicleType.findOne({
        order: [['load_capacity', 'DESC']],
        transaction
      });
      if (maxType) {
        maxCapacity = maxType.load_capacity;
      }
    }
    return maxCapacity;
  }

  async getMaxVehicleCapacity(req) {
    try {
      const maxCapacity = await this._getMaxCapacityValue();
      return { status: true, data: maxCapacity };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async list(req) {
    try {
      const params = req.query;
      const { start_date, end_date, status, search, warehouse_id } = params;
      const { limit, page, offset } = helper.getPagination(params);

      const where = {};
      if (start_date && end_date) {
        where.scheduled_date = { [Op.between]: [start_date, end_date] };
      }
      if (status) where.status = status;
      if (search) {
        where[Op.or] = [
          { dp_number: { [Op.iLike]: `%${search}%` } },
          { destination: { [Op.iLike]: `%${search}%` } }
        ];
      }
      if (warehouse_id) where.warehouse_id = warehouse_id;

      const include = [
        {
          model: SWarehouses, as: 'warehouse',
          attributes: ['id', 'name', ['warehouse_code', 'code']],
          required: true,
          include: [{
            model: RefWarehouseCategories,
            as: 'category',
            attributes: [],
            where: { name: 'Finish Good' }
          }]
        },
        { model: SDocks, as: 'dock', attributes: ['id', 'name'] },
        {
          model: SUsers, as: 'creator', attributes: ['id', 'email'],
          include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
        }
      ];

      const { count, rows } = await SDeliveryPlans.findAndCountAll({
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
      const sdp = await SDeliveryPlans.findByPk(id, {
        include: [
          { model: SWarehouses, as: 'warehouse', attributes: ['id', 'name', ['warehouse_code', 'code']] },
          { model: SDocks, as: 'dock', attributes: ['id', 'name'] },
          {
            model: SUsers, as: 'creator', attributes: ['id', 'email'],
            include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
          },
          {
            model: SDeliveryPlanDetails, as: 'details',
            include: [
              {
                model: SSalesPurchaseOrderDetails, as: 'spoDetail',
                include: [
                  {
                    model: SParts, as: 'part',
                    attributes: ['id', 'part_number', 'part_name', 'package_id'],
                    include: [{ model: SPackages, as: 'package' }]
                  },
                  { model: SSalesPurchaseOrders, as: 'order', attributes: ['id', 'spo_number'] }
                ]
              }
            ]
          }
        ]
      });

      if (!sdp) return { status: false, message: 'Delivery Plan not found', code: 404 };
      return { status: true, data: sdp };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async _generateDPNumber(transaction) {
    const prefix = `DP-${dayjs().format('YYYY-MM')}`;
    const last = await SDeliveryPlans.findOne({
      where: { dp_number: { [Op.like]: `${prefix}-%` } },
      order: [['dp_number', 'DESC']],
      transaction, paranoid: false
    });
    let seq = 1;
    if (last) {
      const parts = last.dp_number.split('-');
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

      const detailSchema = Joi.object({
        spo_detail_id: Joi.number().integer().required(),
        planned_qty: Joi.number().integer().min(1).required()
      });

      const schema = Joi.object({
        scheduled_date: Joi.date().iso().required(),
        time_start: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required(),
        time_end: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required(),
        warehouse_id: Joi.number().integer().required(),
        dock_id: Joi.number().integer().required(),
        destination: Joi.string().required(),
        details: Joi.array().items(detailSchema).min(1).required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) { await t.rollback(); return validation; }

      const { scheduled_date, time_start, time_end, warehouse_id, dock_id, destination, details } = validation.value;

      // Check total planned load capacity against max vehicle capacity
      const totalLoad = await this._calculateTotalLoad(details, t);
      const maxCapacity = await this._getMaxCapacityValue(t);
      if (totalLoad > maxCapacity) {
        await t.rollback();
        return {
          status: false,
          message: `Total planned load (${totalLoad}) exceeds the maximum vehicle capacity (${maxCapacity})`,
          code: 400
        };
      }

      // Validate time order
      if (time_start >= time_end) {
        await t.rollback();
        return { status: false, message: 'time_start must be earlier than time_end', code: 400 };
      }

      // Validate warehouse & dock exist
      const warehouse = await SWarehouses.findByPk(warehouse_id, { transaction: t });
      if (!warehouse) { await t.rollback(); return { status: false, message: 'Warehouse not found', code: 404 }; }

      const dock = await SDocks.findByPk(dock_id, {
        include: [{ model: SWarehouseAreas, as: 'area', attributes: ['warehouse_id'] }],
        transaction: t
      });
      if (!dock) { await t.rollback(); return { status: false, message: 'Dock not found', code: 404 }; }
      if (dock.area?.warehouse_id !== warehouse_id) {
        await t.rollback();
        return { status: false, message: 'Dock does not belong to the specified warehouse', code: 400 };
      }

      // Conflict detection
      // Two time ranges overlap when: existing.start < new.end AND existing.end > new.start
      const conflict = await SDeliveryPlans.findOne({
        where: {
          scheduled_date,
          warehouse_id,
          dock_id,
          time_start: { [Op.lt]: time_end },
          time_end: { [Op.gt]: time_start }
        },
        transaction: t
      });

      if (conflict) {
        await t.rollback();
        return {
          status: false,
          message: `Dock conflict with plan ${conflict.dp_number} (${conflict.time_start} – ${conflict.time_end})`,
          code: 409,
          data: { conflicting_plan: conflict.dp_number }
        };
      }

      // Validate planned_qty per SPO detail
      for (const item of details) {
        const spoDetail = await SSalesPurchaseOrderDetails.findByPk(item.spo_detail_id, {
          include: [{ model: SSalesPurchaseOrders, as: 'order', attributes: ['id', 'status', 'delivery_due_date'] }],
          transaction: t
        });

        if (!spoDetail) {
          await t.rollback();
          return { status: false, message: `SPO Detail ID ${item.spo_detail_id} not found`, code: 404 };
        }

        if (spoDetail.order?.delivery_due_date) {
          const due = dayjs(spoDetail.order.delivery_due_date).format('YYYY-MM-DD');
          const sched = dayjs(scheduled_date).format('YYYY-MM-DD');
          if (sched > due) {
            await t.rollback();
            return {
              status: false,
              message: `Scheduled shipment date (${sched}) cannot be later than SPO Delivery Due Date (${due})`,
              code: 400
            };
          }
        }

        if (!['Locked', 'Processing'].includes(spoDetail.order?.status)) {
          await t.rollback();
          return {
            status: false,
            message: `SPO Detail ID ${item.spo_detail_id} belongs to an SPO that is not ready for delivery (status: ${spoDetail.order?.status})`,
            code: 400
          };
        }

        // Aggregate already-planned qty for this SPO detail (excluding soft-deleted)
        const [aggRow] = await db.sequelize.query(`
          SELECT COALESCE(SUM(dpd.planned_qty), 0) AS total
          FROM s_delivery_plan_details dpd
          INNER JOIN s_delivery_plans dp ON dp.id = dpd.delivery_plan_id AND dp.deleted_at IS NULL
          WHERE dpd.spo_detail_id = :spoDetailId AND dpd.deleted_at IS NULL
        `, {
          replacements: { spoDetailId: item.spo_detail_id },
          type: db.sequelize.QueryTypes.SELECT,
          transaction: t
        });

        const totalPlanned = parseInt(aggRow.total) || 0;
        const remaining = spoDetail.ordered_qty - totalPlanned;

        if (item.planned_qty > remaining) {
          await t.rollback();
          return {
            status: false,
            message: `Planned qty (${item.planned_qty}) exceeds remaining qty (${remaining}) for SPO Detail ID ${item.spo_detail_id}`,
            code: 400
          };
        }
      }

      // Create SDP
      const dp_number = await this._generateDPNumber(t);

      const sdp = await SDeliveryPlans.create({
        dp_number,
        scheduled_date,
        time_start,
        time_end,
        warehouse_id,
        dock_id,
        destination,
        status: 'Draft',
        created_by: currentUser.id
      }, { transaction: t });

      const detailRecords = details.map(item => ({
        delivery_plan_id: sdp.id,
        spo_detail_id: item.spo_detail_id,
        planned_qty: item.planned_qty
      }));
      await SDeliveryPlanDetails.bulkCreate(detailRecords, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'CREATE_SDP',
        resourceId: sdp.id,
        newData: sdp,
        description: `Created Delivery Plan ${dp_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'Delivery Plan created successfully', data: sdp };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async update(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;

      const sdp = await SDeliveryPlans.findByPk(id, { transaction: t });
      if (!sdp) { await t.rollback(); return { status: false, message: 'Delivery Plan not found', code: 404 }; }

      if (sdp.status !== 'Draft') {
        await t.rollback();
        return { status: false, message: 'Only Draft Delivery Plans can be updated', code: 400 };
      }

      const detailSchema = Joi.object({
        spo_detail_id: Joi.number().integer().required(),
        planned_qty: Joi.number().integer().min(1).required()
      });

      const schema = Joi.object({
        scheduled_date: Joi.date().iso().optional(),
        time_start: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
        time_end: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
        warehouse_id: Joi.number().integer().optional(),
        dock_id: Joi.number().integer().optional(),
        destination: Joi.string().optional(),
        details: Joi.array().items(detailSchema).min(1).optional()
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) { await t.rollback(); return validation; }

      const updates = validation.value;
      const oldData = JSON.parse(JSON.stringify(sdp));

      // Re-run conflict detection if time/date/dock fields change
      const newDate = updates.scheduled_date ?? sdp.scheduled_date;
      const newStart = updates.time_start ?? sdp.time_start;
      const newEnd = updates.time_end ?? sdp.time_end;
      const newWarehouse = updates.warehouse_id ?? sdp.warehouse_id;
      const newDock = updates.dock_id ?? sdp.dock_id;

      if (newStart >= newEnd) {
        await t.rollback();
        return { status: false, message: 'time_start must be earlier than time_end', code: 400 };
      }

      const conflict = await SDeliveryPlans.findOne({
        where: {
          id: { [Op.ne]: sdp.id },
          scheduled_date: newDate,
          warehouse_id: newWarehouse,
          dock_id: newDock,
          time_start: { [Op.lt]: newEnd },
          time_end: { [Op.gt]: newStart }
        },
        transaction: t
      });

      if (conflict) {
        await t.rollback();
        return {
          status: false,
          message: `Dock conflict with plan ${conflict.dp_number} (${conflict.time_start} – ${conflict.time_end})`,
          code: 409
        };
      }

      if (updates.warehouse_id || updates.dock_id) {
        const dock = await SDocks.findByPk(newDock, {
          include: [{ model: SWarehouseAreas, as: 'area', attributes: ['warehouse_id'] }],
          transaction: t
        });
        if (!dock) { await t.rollback(); return { status: false, message: 'Dock not found', code: 404 }; }
        if (dock.area?.warehouse_id !== newWarehouse) {
          await t.rollback();
          return { status: false, message: 'Dock does not belong to the specified warehouse', code: 400 };
        }
      }

      // Validate scheduled date against SPO due dates and check remaining quantities
      const detailsToValidate = updates.details || await SDeliveryPlanDetails.findAll({
        where: { delivery_plan_id: sdp.id },
        transaction: t
      });

      // Check total planned load capacity against max vehicle capacity
      const totalLoad = await this._calculateTotalLoad(detailsToValidate, t);
      const maxCapacity = await this._getMaxCapacityValue(t);
      if (totalLoad > maxCapacity) {
        await t.rollback();
        return {
          status: false,
          message: `Total planned load (${totalLoad}) exceeds the maximum vehicle capacity (${maxCapacity})`,
          code: 400
        };
      }

      for (const item of detailsToValidate) {
        const spoDetail = await SSalesPurchaseOrderDetails.findByPk(item.spo_detail_id, {
          include: [{ model: SSalesPurchaseOrders, as: 'order', attributes: ['id', 'status', 'delivery_due_date'] }],
          transaction: t
        });

        if (!spoDetail) {
          await t.rollback();
          return { status: false, message: `SPO Detail ID ${item.spo_detail_id} not found`, code: 404 };
        }

        if (spoDetail.order?.delivery_due_date) {
          const due = dayjs(spoDetail.order.delivery_due_date).format('YYYY-MM-DD');
          const sched = dayjs(newDate).format('YYYY-MM-DD');
          if (sched > due) {
            await t.rollback();
            return {
              status: false,
              message: `Scheduled shipment date (${sched}) cannot be later than SPO Delivery Due Date (${due})`,
              code: 400
            };
          }
        }

        if (updates.details) {
          if (!['Locked', 'Processing'].includes(spoDetail.order?.status)) {
            await t.rollback();
            return {
              status: false,
              message: `SPO Detail ID ${item.spo_detail_id} belongs to an SPO that is not ready for delivery (status: ${spoDetail.order?.status})`,
              code: 400
            };
          }

          const [aggRow] = await db.sequelize.query(`
            SELECT COALESCE(SUM(dpd.planned_qty), 0) AS total
            FROM s_delivery_plan_details dpd
            INNER JOIN s_delivery_plans dp ON dp.id = dpd.delivery_plan_id AND dp.deleted_at IS NULL
            WHERE dpd.spo_detail_id = :spoDetailId AND dpd.deleted_at IS NULL AND dpd.delivery_plan_id != :planId
          `, {
            replacements: { spoDetailId: item.spo_detail_id, planId: sdp.id },
            type: db.sequelize.QueryTypes.SELECT,
            transaction: t
          });

          const totalPlanned = parseInt(aggRow.total) || 0;
          const remaining = spoDetail.ordered_qty - totalPlanned;

          if (item.planned_qty > remaining) {
            await t.rollback();
            return {
              status: false,
              message: `Planned qty (${item.planned_qty}) exceeds remaining qty (${remaining}) for SPO Detail ID ${item.spo_detail_id}`,
              code: 400
            };
          }
        }
      }

      await sdp.update(updates, { transaction: t });

      if (updates.details) {
        // Soft-delete existing details then re-create
        await SDeliveryPlanDetails.destroy({ where: { delivery_plan_id: sdp.id }, transaction: t });
        const detailRecords = updates.details.map(item => ({
          delivery_plan_id: sdp.id,
          spo_detail_id: item.spo_detail_id,
          planned_qty: item.planned_qty
        }));
        await SDeliveryPlanDetails.bulkCreate(detailRecords, { transaction: t });
      }

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'UPDATE_SDP',
        resourceId: sdp.id,
        oldData,
        newData: sdp,
        description: `Updated Delivery Plan ${sdp.dp_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'Delivery Plan updated successfully' };
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

      const sdp = await SDeliveryPlans.findByPk(id, { transaction: t });
      if (!sdp) { await t.rollback(); return { status: false, message: 'Delivery Plan not found', code: 404 }; }

      if (sdp.status !== 'Draft') {
        await t.rollback();
        return { status: false, message: 'Only Draft Delivery Plans can be deleted', code: 400 };
      }

      const oldData = JSON.parse(JSON.stringify(sdp));
      await sdp.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'DELETE_SDP',
        resourceId: id,
        oldData,
        description: `Deleted Delivery Plan ${sdp.dp_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'Delivery Plan deleted successfully' };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }
}

export default new SDPModule();
