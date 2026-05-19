import { Op } from "sequelize";
import Joi from "joi";
import db from "../../models/index.js";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";

const {
  SProductionPlan,
  SProductionPlanDetail,
  SProductionPlanDoReference,
  SProductionPlanCapacityParam,
  SProductionPlanCapacityResult,
  SProductionPlanAdjustment,
  SDeliveryOrders,
  SDeliveryOrderDetails,
  SDeliveryPlanDetails,
  SSalesPurchaseOrderDetails,
  SCustomers,
  SParts,
  SLines,
  SUom,
  SLineCapacityParam,   // <── tambahan: master default per line
  SStations,
  SStationJobs,
  SJobs,
  sequelize,
} = db;

class PlanModule extends BaseModule {

  // ─── LIST & DETAIL ─────────────────────────────────────────────────────────

  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      const { search = "", status, overall_status } = req.query;

      const where = {};
      if (search) {
        where[Op.or] = [
          { plan_number:       { [Op.iLike]: `%${search}%` } },
          { plan_description:  { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (status)         where.status         = status;
      if (overall_status) where.overall_status = overall_status;

      const { count, rows } = await SProductionPlan.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ["deleted_at"] },
        order: [["created_at", "DESC"]],
      });

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      });
    } catch (error) {
      console.log(`[PlanModule][list]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async detail(req, res) {
    try {
      const { id } = req.params;

      const plan = await SProductionPlan.findByPk(id, {
        include: [
          {
            model: SProductionPlanDetail,
            as: "details",
            include: [
              { model: SCustomers, as: "customer", attributes: ["id", "name"] },
              { model: SParts,     as: "part",     attributes: ["id", "part_number", "part_name"], include: [
                { model: SUom, as: "uom", attributes: ["id", "name"] }
              ] },
            ],
          },
          {
            model: SProductionPlanDoReference,
            as: "do_references",
            include: [
              { model: SDeliveryOrders, as: "delivery_order", attributes: ["id", "do_number", "shipment_date"] },
            ],
          },
          {
            model: SProductionPlanCapacityParam,
            as: "capacity_params",
            include: [{ model: SLines, as: "line", attributes: ["id", "name"] }],
          },
          {
            model: SProductionPlanCapacityResult,
            as: "capacity_results",
            include: [{ model: SLines, as: "line", attributes: ["id", "name"] }],
          },
          {
            model: SProductionPlanAdjustment,
            as: "adjustments",
            include: [{ model: SLines, as: "line", attributes: ["id", "name"] }],
          },
        ],
      });

      if (!plan) {
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }

      return helper.sendResponse(res, { status: true, code: 200, data: plan });
    } catch (error) {
      console.log(`[PlanModule][detail]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─── DROPDOWN DOs TERSEDIA ─────────────────────────────────────────────────

  async getAvailableDeliveryOrders(req, res) {
    try {
      const allocated = await SProductionPlanDoReference.findAll({
        include: [{
          model: SProductionPlan,
          as: "plan",
          where: { status: { [Op.notIn]: ["Rejected", "Cancelled"] } },
          attributes: [],
        }],
        attributes: ["do_id"],
      });
      const allocatedIds = allocated.map((r) => r.do_id);

      const dos = await SDeliveryOrders.findAll({
        where: {
          delivery_status: "Delivered",
          ...(allocatedIds.length ? { id: { [Op.notIn]: allocatedIds } } : {}),
        },
        attributes: ["id", "do_number", "shipment_date", "customer_id"],
        include: [
          { model: SCustomers, as: "customer", attributes: ["id", "name"] },
          {
            model: SDeliveryOrderDetails,
            as: "details",
            attributes: ["id", "sent_qty", "received_qty"],
            include: [
              {
                model: SDeliveryPlanDetails,
                as: "planDetail",
                include: [
                  {
                    model: SSalesPurchaseOrderDetails,
                    as: "spoDetail",
                    include: [
                      { 
                        model: SParts, 
                        as: "part", 
                        attributes: ["id", "part_number", "part_name"],
                        include: [
                          { model: SUom, as: "uom", attributes: ["id", "name"]}
                        ] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        order: [["shipment_date", "ASC"]],
      });

      return helper.sendResponse(res, { status: true, code: 200, data: dos });
    } catch (error) {
      console.log(`[PlanModule][getAvailableDeliveryOrders]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async syncDOs(req, res) {
    const t = await sequelize.transaction()
    try {
      const { id } = req.params
      const schema = Joi.object({
        do_ids: Joi.array().items(Joi.number().integer()).min(1).required(),
      })
  
      const validation = helper.validate(req.body, schema)
      if (!validation.status) {
        await t.rollback()
        return helper.sendResponse(res, validation)
      }
  
      const { do_ids } = validation.value
  
      const plan = await SProductionPlan.findByPk(id, {
        include: [{ model: SProductionPlanDoReference, as: 'do_references' }],
        transaction: t,
      })
      if (!plan) { /* 404 */ }
      if (!['Draft', 'Rejected'].includes(plan.status)) { /* 400 */ }
  
      const currentDoIds = plan.do_references.map(r => r.do_id)
      const toAdd    = do_ids.filter(id => !currentDoIds.includes(id))
      const toRemove = currentDoIds.filter(id => !do_ids.includes(id))
  
      // Hapus DO references yang dihapus
      if (toRemove.length > 0) {
        await SProductionPlanDoReference.destroy({
          where: { plan_id: id, do_id: toRemove },
          transaction: t,
        })
        // Hapus plan details yang berasal dari DO yang dihapus
        await SProductionPlanDetail.destroy({
          where: { plan_id: id, do_id: toRemove },
          transaction: t,
        })
      }
  
      // Add DO references and new details
      if (toAdd.length > 0) {
        // validasi DO exists & Delivered
        const dos = await SDeliveryOrders.findAll({
          where: { id: toAdd, delivery_status: 'Delivered' },
          attributes: ['id', 'shipment_date', 'customer_id'],
          include: [{
            model: SDeliveryOrderDetails,
            as: 'details',
            attributes: ['id', 'sent_qty'],
            include: [{
              model: SDeliveryPlanDetails,
              as: 'planDetail',
              attributes: ['id', 'spo_detail_id', 'planned_qty'],
              include: [{
                model: SSalesPurchaseOrderDetails,
                as: 'spoDetail',
                attributes: ['id', 'part_id'],
              }],
            }],
          }],
          transaction: t,
        })
        if (dos.length !== toAdd.length) {
          await t.rollback()
          return helper.sendResponse(res, { 
            status: false, 
            code: 400, 
            error: 'One or more Delivery Orders are invalid or not in Delivered status' 
          })
        }

        // bulkCreate do_references
        await SProductionPlanDoReference.bulkCreate(
          toAdd.map(do_id => ({ plan_id: id, do_id })),
          { transaction: t }
        )

        // generate dan bulkCreate plan details
        const resolvePartId = (dd) => dd.planDetail?.spoDetail?.part_id ?? null
        const resolveQty    = (dd) => dd.sent_qty ?? 0

        const detailMap = new Map();
        dos.forEach((doObj) => {
          doObj.details.forEach((dd) => {
            const part_id       = resolvePartId(dd);
            if (!part_id) return;
            const delivery_date = doObj.shipment_date;
            const key = `${doObj.customer_id}_${part_id}_${delivery_date}`;

            if (detailMap.has(key)) {
              detailMap.get(key).qty_request += resolveQty(dd);
            } else {
              detailMap.set(key, {
                plan_id:plan.id,
                do_id: doObj.id,
                do_detail_id: dd.id,
                customer_id: doObj.customer_id,
                part_id,
                delivery_date,
                qty_request: resolveQty(dd),
                status: "Not_Calculated",
              });
            }
          });
        });

        // Get current max sequence to continue from
        const lastDetail = await SProductionPlanDetail.findOne({
          where:     { plan_id: id },
          order:     [['sequence', 'DESC']],
          transaction: t,
        })
        const startSeq = (lastDetail?.sequence ?? 0) + 1

        const details = Array.from(detailMap.values()).map((d, i) => ({
          ...d,
          sequence: startSeq + i,
        }))
        await SProductionPlanDetail.bulkCreate(details, { transaction: t });
      }
  
      // Recalculate totals from updated details
      const updatedDetails = await SProductionPlanDetail.findAll({
        where: { plan_id: id },
        transaction: t,
      })

      const total_qty_request = updatedDetails.reduce((s, d) => s + d.qty_request, 0)
      const unique_parts      = new Set(updatedDetails.map((d) => d.part_id))

      await plan.update({
        overall_status:     'Not_Calculated',
        total_qty_capacity: 0,
        total_products:     unique_parts.size,
        total_qty_request,
      }, { transaction: t })
  
      // Reset capacity fields 
      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: 'Not_Calculated' },
        { where: { plan_id: id }, transaction: t }
      )
  
      // Reset capacity results (not calculated yet)
      await SProductionPlanCapacityResult.destroy({
        where: { plan_id: id },
        transaction: t,
      })
  
      await t.commit()
      return helper.sendResponse(res, { status: true, code: 200, message: 'DOs synced successfully' })
    }
    catch (error) {
      await t.rollback()
      console.log(`[PlanModule][syncDOs]:`, error)
      return helper.sendResponse(res, { status: false, code: 500, error: error.message })
    }
  }

  // ─── CREATE DRAFT PLAN ─────────────────────────────────────────────────────

  async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const schema = Joi.object({
        plan_description: Joi.string().optional().allow("", null),
        do_ids:           Joi.array().items(Joi.number().integer()).min(1).required(),
        notes:            Joi.string().optional().allow("", null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { plan_description, do_ids, notes } = validation.value;

      const dos = await SDeliveryOrders.findAll({
        where: { id: { [Op.in]: do_ids }, delivery_status: "Delivered" },
        attributes: ["id", "shipment_date", "customer_id"],
        include: [
          {
            model: SDeliveryOrderDetails,
            as: "details",
            attributes: ["id", "sent_qty", "delivery_plan_detail_id"],
            include: [
              {
                model: SDeliveryPlanDetails,
                as: "planDetail",
                attributes: ["id", "spo_detail_id", "planned_qty"],
                include: [
                  {
                    model: SSalesPurchaseOrderDetails,
                    as: "spoDetail",
                    attributes: ["id", "part_id"],
                  },
                ],
              },
            ],
          },
        ],
        transaction: t,
      });

      if (dos.length !== do_ids.length) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "One or more Delivery Orders are invalid or not in Delivered status",
        });
      }

      // Generate plan number: PP-YYYY-MM-NNNNN
      const now    = new Date();
      const prefix = `PP-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
      const lastPlan = await SProductionPlan.findOne({
        where: { plan_number: { [Op.iLike]: `${prefix}%` } },
        order: [["plan_number", "DESC"]],
        paranoid: false,
        transaction: t,
      });
      const seq         = lastPlan
        ? String(parseInt(lastPlan.plan_number.split("-").pop()) + 1).padStart(5, "0")
        : "00001";
      const plan_number = `${prefix}${seq}`;

      const allDates              = dos.map((d) => new Date(d.shipment_date));
      const earliest_delivery_date = new Date(Math.min(...allDates));
      const latest_delivery_date   = new Date(Math.max(...allDates));

      const resolvePartId = (dd) => dd.planDetail?.spoDetail?.part_id ?? null;
      const resolveQty    = (dd) => dd.sent_qty ?? 0;

      const total_qty_request = dos.reduce(
        (sum, d) => sum + d.details.reduce((s, dd) => s + resolveQty(dd), 0), 0
      );
      const unique_parts = new Set(
        dos.flatMap((d) => d.details.map(resolvePartId).filter(Boolean))
      );

      const plan = await SProductionPlan.create({
        plan_number,
        plan_description,
        earliest_delivery_date,
        latest_delivery_date,
        total_products:    unique_parts.size,
        total_qty_request,
        overall_status:    "Not_Calculated",
        status:            "Draft",
        notes,
        created_by:        req.user?.id ?? null,   // FIX: pakai id bukan username
      }, { transaction: t });

      await SProductionPlanDoReference.bulkCreate(
        do_ids.map((do_id) => ({ plan_id: plan.id, do_id })),
        { transaction: t }
      );

      const detailMap = new Map();
      dos.forEach((doObj) => {
        doObj.details.forEach((dd) => {
          const part_id       = resolvePartId(dd);
          if (!part_id) return;
          const delivery_date = doObj.shipment_date;
          const key           = `${doObj.customer_id}_${part_id}_${delivery_date}`;

          if (detailMap.has(key)) {
            detailMap.get(key).qty_request += resolveQty(dd);
          } else {
            detailMap.set(key, {
              plan_id:       plan.id,
              do_id:         doObj.id,
              do_detail_id:  dd.id,
              customer_id:   doObj.customer_id,
              part_id,
              delivery_date,
              qty_request:   resolveQty(dd),
              status:        "Not_Calculated",
            });
          }
        });
      });

      const details = Array.from(detailMap.values()).map((d, i) => ({ ...d, sequence: i + 1 }));
      await SProductionPlanDetail.bulkCreate(details, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "CREATE",
        resourceId:   plan.id,
        newData:      plan,
        description:  `Created Production Plan ${plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true,
        code: 201,
        message: "Production Plan created successfully",
        data: { id: plan.id, plan_number },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][create]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─── UPDATE HEADER ─────────────────────────────────────────────────────────

  async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema  = Joi.object({
        plan_description: Joi.string().optional().allow("", null),
        notes:            Joi.string().optional().allow("", null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (plan.status !== "Draft") {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Only Draft plans can be edited" });
      }

      const oldData = plan.toJSON();
      await plan.update(validation.value, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "UPDATE",
        resourceId:   plan.id,
        oldData,
        newData:      plan,
        description:  `Updated Production Plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: "Plan updated", data: plan });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][update]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─── CAPACITY PARAMS ───────────────────────────────────────────────────────
  // Mengambil base params dari s_line_capacity_params dan menyimpannya ke
  // s_production_plan_capacity_params sebagai snapshot untuk plan ini.
  // User hanya perlu mengirim line_id — semua nilai diambil dari master.
  // ──────────────────────────────────────────────────────────────────────────

  async saveCapacityParams(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        line_id: Joi.number().integer().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { line_id } = validation.value;

      // Validasi plan
      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "Capacity params can only be set on Draft or Rejected plans",
        });
      }

      // Ambil master default dari s_line_capacity_params
      const masterParams = await SLineCapacityParam.findOne({
        where: { line_id },
        transaction: t,
      });

      if (!masterParams) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 404,
          error: "Line capacity params not found. Please run capacity calculation on the line first.",
        });
      }

      // Cek apakah BASE param untuk plan + line ini sudah ada
      const existing = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id, param_type: "BASE" },
        transaction: t,
      });

      if (existing) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "BASE parameters already exist for this line. Delete existing params first to reset.",
        });
      }

      // Copy nilai dari master ke snapshot plan
      const record = await SProductionPlanCapacityParam.create({
        plan_id:                  id,
        line_id,
        param_type:               "BASE",
        working_days:             masterParams.default_working_days,
        shifts_per_day:           masterParams.default_shifts_per_day,
        working_hours_per_shift:  masterParams.default_working_hours_per_shift,
        manpower:                 masterParams.default_manpower,
        efficiency_factor:        masterParams.default_efficiency_factor,
        overtime_hours:           masterParams.default_overtime_hours,
        max_takt_time:            masterParams.default_max_takt_time,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "CREATE",
        resourceId:   plan.id,
        newData:      record,
        description:  `Saved BASE capacity params for line ${line_id} on plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true,
        code: 201,
        message: "BASE parameters saved from line master",
        data: record,
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][saveCapacityParams]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─── CALCULATE CAPACITY ────────────────────────────────────────────────────

  async calculateCapacity(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({ line_id: Joi.number().integer().required() });
      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { line_id } = validation.value;

      const plan = await SProductionPlan.findByPk(id, {
        include: [{ model: SProductionPlanDetail, as: "details" }],
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "Plan cannot be calculated in current status",
        });
      }

      // Ambil BASE param — wajib ada sebelum kalkulasi
      const baseParam = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id, param_type: "BASE" },
        transaction: t,
      });
      if (!baseParam) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "BASE parameters not found. Please save capacity params for this line first.",
        });
      }

      // Ambil semua adjustments untuk line ini, terapkan di atas BASE
      const adjustments = await SProductionPlanAdjustment.findAll({
        where: { plan_id: id, line_id },
        order: [["sequence", "ASC"]],
        transaction: t,
      });

      // Mulai dari nilai BASE, timpa field yang ada adjustment-nya
      const param = {
        working_days:             baseParam.working_days,
        shifts_per_day:           baseParam.shifts_per_day,
        working_hours_per_shift:  parseFloat(baseParam.working_hours_per_shift),
        manpower:                 baseParam.manpower,
        efficiency_factor:        parseFloat(baseParam.efficiency_factor),
        overtime_hours:           parseFloat(baseParam.overtime_hours ?? 0),
        max_takt_time:            baseParam.max_takt_time,  // detik — dari snapshot BASE
      };

      const fieldMap = {
        WORKING_DAYS:  "working_days",
        SHIFTS_PER_DAY: "shifts_per_day",
        WORKING_HOURS: "working_hours_per_shift",
        MANPOWER:      "manpower",
        EFFICIENCY:    "efficiency_factor",
        OVERTIME:      "overtime_hours",
      };

      for (const adj of adjustments) {
        const field = fieldMap[adj.adjustment_type];
        if (field) param[field] = Number(adj.adjusted_value);
      }

      // ── Ambil info aktual line untuk result record ─────────────────────────
      const line = await SLines.findByPk(line_id, { transaction: t });
      if (!line) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Line not found" });
      }

      const total_stations = await SStations.count({
        where: { line_id, status: true, deleted_at: null },
        transaction: t,
      });

      const stationIds = await SStations.findAll({
        where: { line_id, status: true, deleted_at: null },
        attributes: ["id"],
        transaction: t,
      }).then((rows) => rows.map((r) => r.id));

      const total_jobs = stationIds.length > 0
        ? await SStationJobs.count({
            where:    { station_id: stationIds, active: true, deleted_at: null },
            distinct: true,
            col:      "job_id",
            transaction: t,
          })
        : 0;

      // ── Formula kapasitas ──────────────────────────────────────────────────
      // Takt time sudah ada di param (dari BASE atau adjustment),
      // tidak perlu query MAX lagi — konsisten dengan nilai yang sudah disetup.
      const max_takt_time_seconds = param.max_takt_time;
      if (!max_takt_time_seconds || max_takt_time_seconds <= 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "max_takt_time is 0 or not set. Please recalculate line capacity params first.",
        });
      }

      const max_takt_time_minutes = max_takt_time_seconds / 60;
      const capacity_per_hour     = parseFloat((60 / max_takt_time_minutes).toFixed(2));

      // FIX: overtime dikalikan working_days dan shifts_per_day
      // (lembur terjadi setiap hari kerja, bukan hanya sekali)
      const regular_minutes  =
        param.working_days * param.shifts_per_day * param.working_hours_per_shift * 60;
      const overtime_minutes =
        param.working_days * param.shifts_per_day * param.overtime_hours * 60;
      const available_minutes = regular_minutes + overtime_minutes;

      const total_capacity_minutes =
        available_minutes * param.manpower * param.efficiency_factor;

      const total_capacity_units =
        Math.floor(total_capacity_minutes / max_takt_time_minutes);

      const total_qty_request     = plan.details.reduce((s, d) => s + d.qty_request, 0);
      const total_required_minutes = total_qty_request * max_takt_time_minutes;
      const capacity_gap_minutes   =
        parseFloat((total_capacity_minutes - total_required_minutes).toFixed(2));
      const utilization_pct        = total_capacity_minutes > 0
        ? parseFloat(((total_required_minutes / total_capacity_minutes) * 100).toFixed(2))
        : 0;

      const overall_status = capacity_gap_minutes >= 0 ? "POSSIBLE" : "IMPOSSIBLE";

      // ── Update qty_capacity & status per detail produk ─────────────────────
      for (const detail of plan.details) {
        const allocation_ratio = total_qty_request > 0
          ? detail.qty_request / total_qty_request
          : 0;
        const qty_capacity  = Math.floor(allocation_ratio * total_capacity_units);
        const capacity_gap  = qty_capacity - detail.qty_request;
        const detail_status = capacity_gap >= 0 ? "POSSIBLE" : "IMPOSSIBLE";

        await detail.update(
          { qty_capacity, capacity_gap, status: detail_status },
          { transaction: t }
        );
      }

      // ── Upsert capacity result ─────────────────────────────────────────────
      const [result, created] = await SProductionPlanCapacityResult.findOrCreate({
        where:    { plan_id: id, line_id },
        defaults: {
          plan_id: id,
          line_id,
          total_stations,
          total_jobs,
          max_takt_time:           max_takt_time_seconds,
          capacity_per_hour,
          total_capacity_minutes,
          total_required_minutes,
          capacity_gap_minutes,
          utilization_pct,
          status:                  overall_status,
          calculated_at:           new Date(),
          calculation_version:     1,
        },
        transaction: t,
      });

      if (!created) {
        await result.update({
          total_stations,
          total_jobs,
          max_takt_time:           max_takt_time_seconds,
          capacity_per_hour,
          total_capacity_minutes,
          total_required_minutes,
          capacity_gap_minutes,
          utilization_pct,
          status:                  overall_status,
          calculated_at:           new Date(),
          calculation_version:     result.calculation_version + 1,
        }, { transaction: t });
      }

      await plan.update({
        total_qty_capacity: total_capacity_units,
        overall_status,
      }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, {
        status: true,
        code: 200,
        message: `Capacity calculated. Overall status: ${overall_status}`,
        data: {
          overall_status,
          total_capacity_units,
          total_required_minutes,
          total_capacity_minutes,
          capacity_gap_minutes,
          utilization_pct,
          capacity_info: {
            total_stations,
            total_jobs,
            max_takt_time_seconds,
            capacity_per_hour,
            // Breakdown menit untuk transparansi di UI
            regular_minutes:  parseFloat(regular_minutes.toFixed(2)),
            overtime_minutes: parseFloat(overtime_minutes.toFixed(2)),
            available_minutes: parseFloat(available_minutes.toFixed(2)),
          },
          params_used: param,
          adjustments_applied: adjustments.length,
          details: plan.details,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][calculateCapacity]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─── ADD ADJUSTMENT ────────────────────────────────────────────────────────

  async addAdjustment(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        line_id:                Joi.number().integer().required(),
        adjustment_type:        Joi.string().valid(
          "WORKING_DAYS", "SHIFTS_PER_DAY", "WORKING_HOURS",
          "MANPOWER", "EFFICIENCY", "OVERTIME"
        ).required(),
        adjusted_value:         Joi.number().required(),
        adjustment_description: Joi.string().allow("", null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { line_id, adjustment_type, adjusted_value, adjustment_description } = validation.value;

      // BASE param harus ada sebelum bisa adjustment
      const base = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id, param_type: "BASE" },
        transaction: t,
      });
      if (!base) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "BASE parameters not found for this line",
        });
      }

      const fieldMap = {
        WORKING_DAYS:   "working_days",
        SHIFTS_PER_DAY: "shifts_per_day",
        WORKING_HOURS:  "working_hours_per_shift",
        MANPOWER:       "manpower",
        EFFICIENCY:     "efficiency_factor",
        OVERTIME:       "overtime_hours",
      };

      const fieldName  = fieldMap[adjustment_type];
      const base_value = Number(base[fieldName]);

      const lastAdj = await SProductionPlanAdjustment.findOne({
        where: { plan_id: id, line_id },
        order: [["sequence", "DESC"]],
        paranoid: false,
        transaction: t,
      });
      const sequence = lastAdj ? lastAdj.sequence + 1 : 1;

      const adj = await SProductionPlanAdjustment.create({
        plan_id: id,
        line_id,
        sequence,
        adjustment_type,
        adjustment_description,
        base_value,
        adjusted_value,
        difference: adjusted_value - base_value,
        created_by: req.user?.id ?? null,   // FIX: pakai id bukan username
      }, { transaction: t });

      // Reset capacity results and plan details for this line — recalculation required
      await SProductionPlanCapacityResult.update({
        total_stations: 0,
        total_jobs: 0,
        max_takt_time: 0,
        capacity_per_hour: 0,
        total_capacity_minutes: 0,
        total_required_minutes: 0,
        capacity_gap_minutes: 0,
        utilization_pct: 0,
        status: "Not_Calculated",
      }, {
        where: { plan_id: id, line_id },
        transaction: t,
      })

      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: 'Not_Calculated' },
        { where: { plan_id: id }, transaction: t }
      )

      await SProductionPlan.update(
        { overall_status: 'Not_Calculated', total_qty_capacity: 0 },
        { where: { id }, transaction: t }
      )

      await t.commit();
      return helper.sendResponse(res, {
        status: true,
        code: 201,
        message: "Adjustment saved. Run calculateCapacity again to apply.",
        data: adj,
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][addAdjustment]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async deleteAdjustment(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, adj_id } = req.params;
      const adj = await SProductionPlanAdjustment.findOne({
        where: { id: adj_id, plan_id: id },
        transaction: t,
      });
      if (!adj) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Adjustment not found" });
      }

      const { line_id } = adj
      await adj.destroy({ transaction: t });

      // Reset capacity results and plan details for this line exclude calculation_version — recalculation required
      await SProductionPlanCapacityResult.update({
        total_stations: null,
        total_jobs: null,
        max_takt_time: null,
        capacity_per_hour: null,
        total_capacity_minutes: null,
        total_required_minutes: null,
        capacity_gap_minutes: null,
        utilization_pct: null,
        status: "Not_Calculated",
      }, {
        where: { plan_id: id, line_id },
        transaction: t,
      })

      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: 'Not_Calculated' },
        { where: { plan_id: id }, transaction: t }
      )

      await SProductionPlan.update(
        { overall_status: 'Not_Calculated', total_qty_capacity: 0 },
        { where: { id }, transaction: t }
      )

      await t.commit();
      return helper.sendResponse(res, {
        status: true,
        code: 200,
        message: "Adjustment deleted. Run calculateCapacity again to re-apply remaining adjustments.",
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][deleteAdjustment]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─── SUBMIT / APPROVE / REJECT ─────────────────────────────────────────────

  async submitForApproval(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const plan = await SProductionPlan.findByPk(id, {
        include: [{ model: SProductionPlanDetail, as: "details" }],
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (!["Draft", "Rejected"].includes(plan.status)) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "Only Draft or Rejected plans can be submitted",
        });
      }
      if (plan.overall_status === "Not_Calculated") {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "Capacity has not been calculated yet. Please run capacity calculation first.",
        });
      }

      const impossibleDetails = plan.details.filter((d) => d.status === "IMPOSSIBLE");
      if (impossibleDetails.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: `${impossibleDetails.length} product(s) have IMPOSSIBLE capacity. Add adjustments and recalculate first.`,
        });
      }

      const oldData = plan.toJSON();
      await plan.update({ status: "Pending_Approval" }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "SUBMIT",
        resourceId:   plan.id,
        oldData,
        newData:      plan,
        description:  `Submitted Production Plan ${plan.plan_number} for approval`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true,
        code: 200,
        message: "Production Plan submitted for approval",
        data: { id: plan.id, plan_number: plan.plan_number, status: "Pending_Approval" },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][submitForApproval]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async approve(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema  = Joi.object({
        approval_notes: Joi.string().optional().allow("", null),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (plan.status !== "Pending_Approval") {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Plan is not pending approval" });
      }

      const oldData = plan.toJSON();
      await plan.update({
        status:         "Approved",
        approved_by:    req.user?.id ?? null,   // FIX: pakai id bukan username
        approved_at:    new Date(),
        approval_notes: validation.value.approval_notes,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "APPROVE",
        resourceId:   plan.id,
        oldData,
        newData:      plan,
        description:  `Approved Production Plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true,
        code: 200,
        message: "Production Plan approved",
        data: { id: plan.id, plan_number: plan.plan_number, status: "Approved" },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][approve]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async reject(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema  = Joi.object({
        rejection_reason: Joi.string().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (plan.status !== "Pending_Approval") {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Plan is not pending approval" });
      }

      const oldData = plan.toJSON();
      await plan.update({
        status:           "Rejected",
        rejected_by:      req.user?.id ?? null,   // FIX: pakai id bukan username
        rejected_at:      new Date(),
        rejection_reason: validation.value.rejection_reason,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "REJECT",
        resourceId:   plan.id,
        oldData,
        newData:      plan,
        description:  `Rejected Production Plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true,
        code: 200,
        message: "Production Plan rejected",
        data: { id: plan.id, plan_number: plan.plan_number, status: "Rejected" },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][reject]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─── DELETE ────────────────────────────────────────────────────────────────

  async delete(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const plan = await SProductionPlan.findByPk(id, { transaction: t });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Production Plan not found" });
      }
      if (plan.status !== "Draft") {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: "Only Draft plans can be deleted" });
      }

      const oldData = plan.toJSON();
      await plan.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "DELETE",
        resourceId:   plan.id,
        oldData,
        description:  `Deleted Production Plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: "Production Plan deleted" });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][delete]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─── DROPDOWN ──────────────────────────────────────────────────────────────

  async getDropdown(req, res) {
    try {
      const plans = await SProductionPlan.findAll({
        where:      { status: "Approved", deleted_at: null },
        attributes: ["id", "plan_number", "plan_description", "earliest_delivery_date", "latest_delivery_date"],
        order:      [["plan_number", "DESC"]],
      });
      return helper.sendResponse(res, { status: true, code: 200, data: plans });
    } catch (error) {
      console.log(`[PlanModule][getDropdown]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }
}

export default new PlanModule();