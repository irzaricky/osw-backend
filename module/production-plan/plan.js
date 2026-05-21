import { Op } from "sequelize";
import Joi from "joi";
import db from "../../models/index.js";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";

const {
  SProductionPlan,
  SProductionPlanDetail,
  SProductionPlanDetailLine,   // NEW: pivot table (plan_detail_id, line_id, sequence, qty_capacity, capacity_gap, status)
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
  SLineCapacityParam,
  SStations,
  SStationJobs,
  SJobs,
  SPartRoutings,
  SPartRoutingDetails,
  sequelize,
} = db;

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Auto-assign lines dari routing per part
// Mengambil distinct line_id dari SPartRoutingDetails → SStations → line_id
// berdasarkan routing aktif & default untuk setiap part_id yang diberikan.
//
// Return: Map<part_id, [{ line_id, sequence }]>
// ─────────────────────────────────────────────────────────────────────────────
async function getRoutingLinesByPartIds(partIds, t) {
  if (!partIds.length) return new Map();

  // Ambil routing aktif & default per part
  const routings = await SPartRoutings.findAll({
    where:       { part_id: partIds, active: true, is_default: true },
    attributes:  ["id", "part_id"],
    include: [{
      model:      SPartRoutingDetails,
      as:         "routing_details",
      attributes: ["sequence", "station_id"],
      include: [{
        model:      SStations,
        as:         "station",
        attributes: ["line_id"],
        where:      { status: true, deleted_at: null },
      }],
    }],
    transaction: t,
  });

  const map = new Map(); // part_id → Set<line_id>
  for (const routing of routings) {
    if (!map.has(routing.part_id)) map.set(routing.part_id, new Map());
    const lineSeqMap = map.get(routing.part_id); // line_id → min_sequence

    for (const rd of routing.routing_details) {
      const line_id = rd.station?.line_id;
      if (!line_id) continue;
      // Pakai sequence terkecil dari routing detail sebagai urutan line
      if (!lineSeqMap.has(line_id) || rd.sequence < lineSeqMap.get(line_id)) {
        lineSeqMap.set(line_id, rd.sequence);
      }
    }
  }

  // Konversi ke Map<part_id, [{ line_id, sequence }]> terurut
  const result = new Map();
  for (const [part_id, lineSeqMap] of map.entries()) {
    const sorted = [...lineSeqMap.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([line_id, sequence], idx) => ({ line_id, sequence: idx + 1 }));
    result.set(part_id, sorted);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Buat SProductionPlanDetailLine rows sekaligus auto-init BASE params
// untuk setiap line yang belum ada BASE param-nya di plan ini.
// ─────────────────────────────────────────────────────────────────────────────
async function autoAssignDetailLines(planId, details, routingMap, t) {
  if (!details.length) return;

  // Kumpulkan semua line_id yang akan di-assign
  const allLineIds = new Set();
  for (const detail of details) {
    const lines = routingMap.get(detail.part_id) ?? [];
    lines.forEach((l) => allLineIds.add(l.line_id));
  }

  // Pastikan BASE param tersedia untuk setiap line (auto-create dari master)
  if (allLineIds.size > 0) {
    const masterParams = await SLineCapacityParam.findAll({
      where:       { line_id: [...allLineIds] },
      transaction: t,
    });
    const masterMap = new Map(masterParams.map((m) => [m.line_id, m]));

    const existingParams = await SProductionPlanCapacityParam.findAll({
      where:       { plan_id: planId, line_id: [...allLineIds], param_type: "BASE" },
      transaction: t,
    });
    const existingParamLineIds = new Set(existingParams.map((p) => p.line_id));

    const paramsToCreate = [];
    for (const line_id of allLineIds) {
      if (existingParamLineIds.has(line_id)) continue;
      const m = masterMap.get(line_id);
      if (!m) continue; // line belum punya master param, skip
      paramsToCreate.push({
        plan_id:                 planId,
        line_id,
        param_type:              "BASE",
        working_days:            m.default_working_days,
        shifts_per_day:          m.default_shifts_per_day,
        working_hours_per_shift: m.default_working_hours_per_shift,
        manpower:                m.default_manpower,
        efficiency_factor:       m.default_efficiency_factor,
        overtime_hours:          m.default_overtime_hours,
        max_takt_time:           m.default_max_takt_time,
      });
    }
    if (paramsToCreate.length > 0) {
      await SProductionPlanCapacityParam.bulkCreate(paramsToCreate, { transaction: t });
    }
  }

  // Buat baris SProductionPlanDetailLine
  const rows = [];
  for (const detail of details) {
    const lines = routingMap.get(detail.part_id) ?? [];
    for (const { line_id, sequence } of lines) {
      rows.push({
        plan_detail_id: detail.id,
        line_id,
        sequence,
        status:         "Not_Calculated",
      });
    }
  }
  if (rows.length > 0) {
    await SProductionPlanDetailLine.bulkCreate(rows, {
      ignoreDuplicates: true, // idempotent jika dipanggil ulang
      transaction: t,
    });
  }
}

class PlanModule extends BaseModule {

  // ─────────────────────────────────────────────────────────────
  // LIST
  // ─────────────────────────────────────────────────────────────
  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      const { search = "", status, overall_status } = req.query;

      const where = {};
      if (search) {
        where[Op.or] = [
          { plan_number:      { [Op.iLike]: `%${search}%` } },
          { plan_description: { [Op.iLike]: `%${search}%` } },
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

  // ─────────────────────────────────────────────────────────────
  // DETAIL
  // ─────────────────────────────────────────────────────────────
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
              {
                model: SParts,
                as: "part",
                attributes: ["id", "part_number", "part_name"],
                include: [{ model: SUom, as: "uom", attributes: ["id", "name"] }],
              },
              // NEW: sertakan detail lines (multi-line per detail)
              {
                model: SProductionPlanDetailLine,
                as: "detail_lines",
                include: [{ model: SLines, as: "line", attributes: ["id", "name"] }],
              },
            ],
          },
          {
            model: SProductionPlanDoReference,
            as: "do_references",
            include: [
              {
                model: SDeliveryOrders,
                as: "delivery_order",
                attributes: ["id", "do_number", "shipment_date"],
              },
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

  // ─────────────────────────────────────────────────────────────
  // GET AVAILABLE DELIVERY ORDERS
  // (tidak ada perubahan)
  // ─────────────────────────────────────────────────────────────
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
                        include: [{ model: SUom, as: "uom", attributes: ["id", "name"] }],
                      },
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

  // ─────────────────────────────────────────────────────────────
  // SYNC DOs
  // CHANGED: setelah sync, auto-assign lines dari routing
  // ─────────────────────────────────────────────────────────────
  async syncDOs(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const schema = Joi.object({
        do_ids: Joi.array().items(Joi.number().integer()).min(1).required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { do_ids } = validation.value;

      const plan = await SProductionPlan.findByPk(id, {
        include: [{ model: SProductionPlanDoReference, as: "do_references" }],
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
          error: "Only Draft or Rejected plans can be synced",
        });
      }

      const currentDoIds = plan.do_references.map((r) => r.do_id);
      const toAdd    = do_ids.filter((did) => !currentDoIds.includes(did));
      const toRemove = currentDoIds.filter((did) => !do_ids.includes(did));

      if (toRemove.length > 0) {
        // Hapus detail lines dulu (FK constraint), lalu detail
        const removedDetails = await SProductionPlanDetail.findAll({
          where:       { plan_id: id, do_id: toRemove },
          attributes:  ["id"],
          transaction: t,
        });
        const removedDetailIds = removedDetails.map((d) => d.id);
        if (removedDetailIds.length > 0) {
          await SProductionPlanDetailLine.destroy({
            where: { plan_detail_id: removedDetailIds },
            transaction: t,
          });
        }
        await SProductionPlanDoReference.destroy({
          where: { plan_id: id, do_id: toRemove },
          transaction: t,
        });
        await SProductionPlanDetail.destroy({
          where: { plan_id: id, do_id: toRemove },
          transaction: t,
        });
      }

      let newDetails = [];
      if (toAdd.length > 0) {
        const dos = await SDeliveryOrders.findAll({
          where: { id: toAdd, delivery_status: "Delivered" },
          attributes: ["id", "shipment_date", "customer_id"],
          include: [{
            model: SDeliveryOrderDetails,
            as: "details",
            attributes: ["id", "sent_qty"],
            include: [{
              model: SDeliveryPlanDetails,
              as: "planDetail",
              attributes: ["id", "spo_detail_id", "planned_qty"],
              include: [{
                model: SSalesPurchaseOrderDetails,
                as: "spoDetail",
                attributes: ["id", "part_id"],
              }],
            }],
          }],
          transaction: t,
        });

        if (dos.length !== toAdd.length) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false,
            code: 400,
            error: "One or more Delivery Orders are invalid or not in Delivered status",
          });
        }

        await SProductionPlanDoReference.bulkCreate(
          toAdd.map((do_id) => ({ plan_id: id, do_id })),
          { transaction: t }
        );

        const resolvePartId = (dd) => dd.planDetail?.spoDetail?.part_id ?? null;
        const resolveQty    = (dd) => dd.sent_qty ?? 0;

        const detailMap = new Map();
        dos.forEach((doObj) => {
          doObj.details.forEach((dd) => {
            const part_id = resolvePartId(dd);
            if (!part_id) return;
            const delivery_date = doObj.shipment_date;
            const key = `${doObj.customer_id}_${part_id}_${delivery_date}`;

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

        const lastDetail = await SProductionPlanDetail.findOne({
          where:       { plan_id: id },
          order:       [["sequence", "DESC"]],
          transaction: t,
        });
        const startSeq = (lastDetail?.sequence ?? 0) + 1;

        const detailRows = Array.from(detailMap.values()).map((d, i) => ({
          ...d,
          sequence: startSeq + i,
        }));
        newDetails = await SProductionPlanDetail.bulkCreate(detailRows, {
          returning:   true,
          transaction: t,
        });
      }

      // Auto-assign lines untuk detail baru
      if (newDetails.length > 0) {
        const partIds    = [...new Set(newDetails.map((d) => d.part_id))];
        const routingMap = await getRoutingLinesByPartIds(partIds, t);
        await autoAssignDetailLines(plan.id, newDetails, routingMap, t);
      }

      const updatedDetails = await SProductionPlanDetail.findAll({
        where: { plan_id: id },
        transaction: t,
      });

      const total_qty_request = updatedDetails.reduce((s, d) => s + d.qty_request, 0);
      const unique_parts      = new Set(updatedDetails.map((d) => d.part_id));

      await plan.update({
        overall_status:     "Not_Calculated",
        total_qty_capacity: 0,
        total_products:     unique_parts.size,
        total_qty_request,
      }, { transaction: t });

      await SProductionPlanDetail.update(
        { qty_capacity: null, capacity_gap: null, status: "Not_Calculated" },
        { where: { plan_id: id }, transaction: t }
      );

      // Reset semua capacity results karena data DO berubah
      await SProductionPlanCapacityResult.destroy({
        where: { plan_id: id },
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: "DOs synced and lines auto-assigned from routing" });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][syncDOs]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CREATE
  // CHANGED: setelah create, auto-assign lines dari routing
  // ─────────────────────────────────────────────────────────────
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

      // Generate plan_number
      const now    = new Date();
      const prefix = `PP-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
      const lastPlan = await SProductionPlan.findOne({
        where:    { plan_number: { [Op.iLike]: `${prefix}%` } },
        order:    [["plan_number", "DESC"]],
        paranoid: false,
        transaction: t,
      });
      const seq         = lastPlan
        ? String(parseInt(lastPlan.plan_number.split("-").pop()) + 1).padStart(5, "0")
        : "00001";
      const plan_number = `${prefix}${seq}`;

      const allDates               = dos.map((d) => new Date(d.shipment_date));
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
        created_by:        req.user?.id ?? null,
      }, { transaction: t });

      await SProductionPlanDoReference.bulkCreate(
        do_ids.map((do_id) => ({ plan_id: plan.id, do_id })),
        { transaction: t }
      );

      const detailMap = new Map();
      dos.forEach((doObj) => {
        doObj.details.forEach((dd) => {
          const part_id = resolvePartId(dd);
          if (!part_id) return;
          const delivery_date = doObj.shipment_date;
          const key           = `${doObj.customer_id}_${part_id}_${delivery_date}`;

          if (detailMap.has(key)) {
            detailMap.get(key).qty_request += resolveQty(dd);
          } else {
            detailMap.set(key, {
              plan_id:      plan.id,
              do_id:        doObj.id,
              do_detail_id: dd.id,
              customer_id:  doObj.customer_id,
              part_id,
              delivery_date,
              qty_request:  resolveQty(dd),
              status:       "Not_Calculated",
            });
          }
        });
      });

      const detailRows = Array.from(detailMap.values()).map((d, i) => ({
        ...d,
        sequence: i + 1,
      }));
      const createdDetails = await SProductionPlanDetail.bulkCreate(detailRows, {
        returning:   true,
        transaction: t,
      });

      // Auto-assign lines dari routing
      const partIds    = [...new Set(createdDetails.map((d) => d.part_id))];
      const routingMap = await getRoutingLinesByPartIds(partIds, t);
      await autoAssignDetailLines(plan.id, createdDetails, routingMap, t);

      // Hitung berapa line yang berhasil di-assign
      const totalAssignedLines = [...routingMap.values()].reduce((s, v) => s + v.length, 0);
      const partsWithNoRouting = partIds.filter((pid) => !(routingMap.get(pid) ?? []).length);

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
        data: {
          id:                    plan.id,
          plan_number,
          total_detail_lines:    totalAssignedLines,
          parts_without_routing: partsWithNoRouting.length,
          warning: partsWithNoRouting.length > 0
            ? `${partsWithNoRouting.length} part(s) have no active default routing. Capacity cannot be calculated for those parts.`
            : null,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][create]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // UPDATE (tidak ada perubahan)
  // ─────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────
  // SAVE CAPACITY PARAMS
  // CHANGED: tidak perlu lagi manual per-line karena auto-assign
  // sudah mem-buatkan BASE params. Endpoint ini tetap dipertahankan
  // untuk override/reset manual jika diperlukan admin.
  // ─────────────────────────────────────────────────────────────
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

      const masterParams = await SLineCapacityParam.findOne({
        where: { line_id },
        transaction: t,
      });
      if (!masterParams) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 404,
          error: "Line capacity params not found. Please configure the line master capacity first.",
        });
      }

      // Jika sudah ada, update (reset ke master). Jika belum, create.
      const [record, created] = await SProductionPlanCapacityParam.findOrCreate({
        where:    { plan_id: id, line_id, param_type: "BASE" },
        defaults: {
          plan_id:                 id,
          line_id,
          param_type:              "BASE",
          working_days:            masterParams.default_working_days,
          shifts_per_day:          masterParams.default_shifts_per_day,
          working_hours_per_shift: masterParams.default_working_hours_per_shift,
          manpower:                masterParams.default_manpower,
          efficiency_factor:       masterParams.default_efficiency_factor,
          overtime_hours:          masterParams.default_overtime_hours,
          max_takt_time:           masterParams.default_max_takt_time,
        },
        transaction: t,
      });

      if (!created) {
        await record.update({
          working_days:            masterParams.default_working_days,
          shifts_per_day:          masterParams.default_shifts_per_day,
          working_hours_per_shift: masterParams.default_working_hours_per_shift,
          manpower:                masterParams.default_manpower,
          efficiency_factor:       masterParams.default_efficiency_factor,
          overtime_hours:          masterParams.default_overtime_hours,
          max_takt_time:           masterParams.default_max_takt_time,
        }, { transaction: t });
      }

      // Reset hasil kalkulasi line ini karena param berubah
      await SProductionPlanCapacityResult.destroy({
        where: { plan_id: id, line_id },
        transaction: t,
      });

      await this.logActivity(req, {
        moduleCode:   "production-plan",
        activityCode: "UPDATE",
        resourceId:   plan.id,
        newData:      record,
        description:  `Reset BASE capacity params for line ${line_id} on plan ${plan.plan_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true,
        code: created ? 201 : 200,
        message: created ? "BASE parameters created from line master" : "BASE parameters reset to line master defaults",
        data: record,
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][saveCapacityParams]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // assignLine → DIHAPUS, digantikan oleh auto-assign di create/syncDOs
  // ─────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────
  // CALCULATE CAPACITY
  //
  // CHANGED:
  //   - lineDetails sekarang diambil dari SProductionPlanDetailLine
  //     (bukan filter assigned_line_id di SProductionPlanDetail).
  //   - overall_status bottleneck: untuk setiap part, kapasitas efektif
  //     = min(capacity_units) dari semua line yang dilalui part tsb.
  //     Jika min < qty_request → IMPOSSIBLE.
  //   - qty_capacity di SProductionPlanDetailLine di-update per line.
  // ─────────────────────────────────────────────────────────────
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

      // Ambil detail lines yang assigned ke line ini (pivot table)
      const assignedDetailLines = await SProductionPlanDetailLine.findAll({
        where:       { line_id },
        include: [{
          model:      SProductionPlanDetail,
          as:         "plan_detail",
          where:      { plan_id: id },
          attributes: ["id", "part_id", "qty_request"],
        }],
        transaction: t,
      });

      if (assignedDetailLines.length === 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "No plan details are routed through this line. Check part routing configuration.",
        });
      }

      // Ambil BASE param
      const baseParam = await SProductionPlanCapacityParam.findOne({
        where: { plan_id: id, line_id, param_type: "BASE" },
        transaction: t,
      });
      if (!baseParam) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "BASE parameters not found for this line. They should have been auto-created. Please contact admin.",
        });
      }

      // Terapkan adjustments secara berurutan
      const adjustments = await SProductionPlanAdjustment.findAll({
        where: { plan_id: id, line_id },
        order: [["sequence", "ASC"]],
        transaction: t,
      });

      const param = {
        working_days:            baseParam.working_days,
        shifts_per_day:          baseParam.shifts_per_day,
        working_hours_per_shift: parseFloat(baseParam.working_hours_per_shift),
        manpower:                baseParam.manpower,
        efficiency_factor:       parseFloat(baseParam.efficiency_factor),
        overtime_hours:          parseFloat(baseParam.overtime_hours ?? 0),
        max_takt_time:           baseParam.max_takt_time,
      };

      const fieldMap = {
        WORKING_DAYS:   "working_days",
        SHIFTS_PER_DAY: "shifts_per_day",
        WORKING_HOURS:  "working_hours_per_shift",
        MANPOWER:       "manpower",
        EFFICIENCY:     "efficiency_factor",
        OVERTIME:       "overtime_hours",
      };
      for (const adj of adjustments) {
        const field = fieldMap[adj.adjustment_type];
        if (field) param[field] = Number(adj.adjusted_value);
      }

      // Validasi line & takt time
      const line = await SLines.findByPk(line_id, { transaction: t });
      if (!line) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: "Line not found" });
      }

      const max_takt_time_seconds = param.max_takt_time;
      if (!max_takt_time_seconds || max_takt_time_seconds <= 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "max_takt_time is 0 or not set. Please reconfigure the line master capacity params.",
        });
      }
      const max_takt_time_minutes = max_takt_time_seconds / 60;

      // Hitung jumlah station & job aktif di line ini
      const total_stations = await SStations.count({
        where: { line_id, status: true, deleted_at: null },
        transaction: t,
      });
      const stationRows = await SStations.findAll({
        where:       { line_id, status: true, deleted_at: null },
        attributes:  ["id"],
        transaction: t,
      });
      const stationIds = stationRows.map((r) => r.id);
      const total_jobs = stationIds.length > 0
        ? await SStationJobs.count({
            where:       { station_id: stationIds, active: true, deleted_at: null },
            distinct:    true,
            col:         "job_id",
            transaction: t,
          })
        : 0;

      // Kalkulasi kapasitas line
      const capacity_per_hour  = parseFloat((60 / max_takt_time_minutes).toFixed(4));
      const regular_minutes    = param.working_days * param.shifts_per_day * param.working_hours_per_shift * 60;
      const overtime_minutes   = param.working_days * param.overtime_hours * 60;
      const available_minutes  = regular_minutes + overtime_minutes;
      const total_capacity_minutes = available_minutes * param.efficiency_factor;
      const total_capacity_units   = Math.floor(
        (total_capacity_minutes * param.manpower) / max_takt_time_minutes
      );

      const total_qty_request      = assignedDetailLines.reduce((s, dl) => s + dl.plan_detail.qty_request, 0);
      const total_required_minutes = parseFloat((total_qty_request * max_takt_time_minutes).toFixed(2));
      const effective_capacity_minutes = total_capacity_minutes;
      const capacity_gap_minutes = parseFloat(
        (effective_capacity_minutes - (total_required_minutes / param.manpower)).toFixed(2)
      );
      const utilization_pct = effective_capacity_minutes > 0
        ? parseFloat(
            (((total_required_minutes / param.manpower) / effective_capacity_minutes) * 100).toFixed(2)
          )
        : 0;

      const line_status = total_capacity_units >= total_qty_request ? "POSSIBLE" : "IMPOSSIBLE";

      // Update qty_capacity di SProductionPlanDetailLine untuk line ini
      for (const dl of assignedDetailLines) {
        const allocation_ratio = total_qty_request > 0 ? dl.plan_detail.qty_request / total_qty_request : 0;
        const qty_capacity  = Math.floor(allocation_ratio * total_capacity_units);
        const capacity_gap  = qty_capacity - dl.plan_detail.qty_request;
        const detail_status = capacity_gap >= 0 ? "POSSIBLE" : "IMPOSSIBLE";

        await dl.update({ qty_capacity, capacity_gap, status: detail_status }, { transaction: t });
      }

      // Simpan / update capacity result untuk line ini
      const [result, created] = await SProductionPlanCapacityResult.findOrCreate({
        where:    { plan_id: id, line_id },
        defaults: {
          plan_id: id,
          line_id,
          total_stations,
          total_jobs,
          max_takt_time:           max_takt_time_seconds,
          capacity_per_hour,
          total_capacity_minutes:  parseFloat(effective_capacity_minutes.toFixed(2)),
          total_required_minutes,
          capacity_gap_minutes,
          utilization_pct,
          status:                  line_status,
          total_capacity_units,
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
          total_capacity_minutes:  parseFloat(effective_capacity_minutes.toFixed(2)),
          total_required_minutes,
          capacity_gap_minutes,
          utilization_pct,
          status:                  line_status,
          total_capacity_units,
          calculated_at:           new Date(),
          calculation_version:     result.calculation_version + 1,
        }, { transaction: t });
      }

      // ── Agregasi overall_status dengan bottleneck detection ──────────────
      //
      // Untuk setiap part di plan ini, kapasitas efektif = min(capacity_units)
      // dari semua line yang dilalui part tersebut.
      // overall POSSIBLE hanya jika:
      //   1. Semua line yang ada BASE params sudah dikalkulasi
      //   2. Untuk setiap part: min_line_capacity >= qty_request
      //
      const allBaseParams = await SProductionPlanCapacityParam.findAll({
        where: { plan_id: id, param_type: "BASE" },
        transaction: t,
      });
      const allResults = await SProductionPlanCapacityResult.findAll({
        where: { plan_id: id },
        transaction: t,
      });

      const allLinesCalculated = allBaseParams.every((p) =>
        allResults.some((r) => r.line_id === p.line_id)
      );

      let aggregatedStatus;
      if (!allLinesCalculated) {
        aggregatedStatus = "Not_Calculated";
      } else {
        // Ambil semua detail lines yang sudah dikalkulasi untuk plan ini
        const allDetailLines = await SProductionPlanDetailLine.findAll({
          include: [{
            model:      SProductionPlanDetail,
            as:         "plan_detail",
            where:      { plan_id: id },
            attributes: ["id", "part_id", "qty_request"],
          }],
          attributes: ["line_id", "qty_capacity"],
          transaction: t,
        });

        // Per part: cek apakah min capacity di semua line yang dilalui >= qty_request
        const partDetailMap = new Map(); // part_id → { qty_request, line_capacities: [] }
        for (const dl of allDetailLines) {
          const { part_id, qty_request } = dl.plan_detail;
          if (!partDetailMap.has(part_id)) {
            partDetailMap.set(part_id, { qty_request, line_capacities: [] });
          }
          partDetailMap.get(part_id).line_capacities.push(dl.qty_capacity ?? 0);
        }

        let hasBottleneck = false;
        for (const { qty_request, line_capacities } of partDetailMap.values()) {
          const bottleneck_capacity = Math.min(...line_capacities);
          if (bottleneck_capacity < qty_request) {
            hasBottleneck = true;
            break;
          }
        }
        aggregatedStatus = hasBottleneck ? "IMPOSSIBLE" : "POSSIBLE";
      }

      // total_qty_capacity = sum dari bottleneck capacity per part
      // (min capacity_units di semua line yang dilalui tiap part)
      const allDetailLines = await SProductionPlanDetailLine.findAll({
        include: [{
          model:      SProductionPlanDetail,
          as:         "plan_detail",
          where:      { plan_id: id },
          attributes: ["id", "part_id", "qty_request"],
        }],
        attributes: ["line_id", "qty_capacity"],
        transaction: t,
      });

      // Kelompokkan per part untuk hitung bottleneck per part
      const partCapacityMap = new Map();
      for (const dl of allDetailLines) {
        const part_id = dl.plan_detail.part_id;
        if (!partCapacityMap.has(part_id)) partCapacityMap.set(part_id, []);
        partCapacityMap.get(part_id).push(dl.qty_capacity ?? 0);
      }
      const total_qty_capacity = [...partCapacityMap.values()]
        .reduce((sum, caps) => sum + Math.min(...caps), 0);

      await plan.update({
        total_qty_capacity,
        overall_status: aggregatedStatus,
      }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, {
        status: true,
        code: 200,
        message: `Capacity calculated for line ${line_id}. Overall plan status: ${aggregatedStatus}`,
        data: {
          line_id,
          overall_status:      aggregatedStatus,
          line_status,
          total_capacity_units,
          total_qty_request,
          total_required_minutes,
          effective_capacity_minutes: parseFloat(effective_capacity_minutes.toFixed(2)),
          capacity_gap_minutes,
          utilization_pct,
          capacity_info: {
            total_stations,
            total_jobs,
            max_takt_time_seconds,
            capacity_per_hour,
            regular_minutes:   parseFloat(regular_minutes.toFixed(2)),
            overtime_minutes:  parseFloat(overtime_minutes.toFixed(2)),
            available_minutes: parseFloat(available_minutes.toFixed(2)),
          },
          params_used:         param,
          adjustments_applied: adjustments.length,
          detail_lines_count:  assignedDetailLines.length,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log(`[PlanModule][calculateCapacity]:`, error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ADD ADJUSTMENT (tidak ada perubahan logic, hanya reset detail lines)
  // ─────────────────────────────────────────────────────────────
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
          error: "Adjustments can only be added to Draft or Rejected plans",
        });
      }

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
        where:    { plan_id: id, line_id },
        order:    [["sequence", "DESC"]],
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
        created_by: req.user?.id ?? null,
      }, { transaction: t });

      // Reset hasil kalkulasi line ini
      await SProductionPlanCapacityResult.update({
        status:               "Not_Calculated",
        capacity_gap_minutes: null,
        utilization_pct:      null,
        total_capacity_units: 0,
      }, {
        where: { plan_id: id, line_id },
        transaction: t,
      });

      // Reset detail lines yang ada di line ini
      await SProductionPlanDetailLine.update(
        { qty_capacity: null, capacity_gap: null, status: "Not_Calculated" },
        { where: { line_id }, transaction: t }
        // Note: ini akan reset semua detail lines di line ini, terlepas dari plan.
        // Jika ingin scoped ke plan, join lewat subquery atau filter plan_detail_id.
      );

      await SProductionPlan.update(
        { overall_status: "Not_Calculated", total_qty_capacity: 0 },
        { where: { id }, transaction: t }
      );

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

  // ─────────────────────────────────────────────────────────────
  // DELETE ADJUSTMENT
  // ─────────────────────────────────────────────────────────────
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

      const { line_id } = adj;
      await adj.destroy({ transaction: t });

      await SProductionPlanCapacityResult.update({
        status:               "Not_Calculated",
        capacity_gap_minutes: null,
        utilization_pct:      null,
        total_capacity_units: 0,
      }, {
        where: { plan_id: id, line_id },
        transaction: t,
      });

      await SProductionPlanDetailLine.update(
        { qty_capacity: null, capacity_gap: null, status: "Not_Calculated" },
        { where: { line_id }, transaction: t }
      );

      await SProductionPlan.update(
        { overall_status: "Not_Calculated", total_qty_capacity: 0 },
        { where: { id }, transaction: t }
      );

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

  // ─────────────────────────────────────────────────────────────
  // SUBMIT FOR APPROVAL
  // CHANGED: validasi sekarang berbasis SProductionPlanDetailLine,
  // bukan assigned_line_id. Part tanpa routing akan diblock.
  // ─────────────────────────────────────────────────────────────
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

      // Validasi: semua detail harus punya minimal 1 detail line (ada routing)
      const detailIds = plan.details.map((d) => d.id);
      const detailLinesGrouped = await SProductionPlanDetailLine.findAll({
        where:       { plan_detail_id: detailIds },
        attributes:  ["plan_detail_id"],
        transaction: t,
      });
      const detailIdsWithLines = new Set(detailLinesGrouped.map((dl) => dl.plan_detail_id));
      const unrouted = plan.details.filter((d) => !detailIdsWithLines.has(d.id));
      if (unrouted.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: `${unrouted.length} product(s) have no routing configured. Please set up part routing first.`,
        });
      }

      // Validasi: semua line yang punya BASE params sudah dikalkulasi
      const params = await SProductionPlanCapacityParam.findAll({
        where: { plan_id: id, param_type: "BASE" },
        transaction: t,
      });
      const results = await SProductionPlanCapacityResult.findAll({
        where: { plan_id: id },
        transaction: t,
      });

      const uncalculatedLines = params.filter((p) =>
        !results.some((r) => r.line_id === p.line_id)
      );
      if (uncalculatedLines.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: `${uncalculatedLines.length} line(s) have not been calculated yet. Please run capacity calculation for all lines first.`,
        });
      }

      // Tidak boleh ada bottleneck IMPOSSIBLE (sudah dihitung di overall_status)
      if (plan.overall_status === "IMPOSSIBLE") {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: "One or more lines create a capacity bottleneck (IMPOSSIBLE). Add adjustments and recalculate first.",
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

  // ─────────────────────────────────────────────────────────────
  // APPROVE (tidak ada perubahan)
  // ─────────────────────────────────────────────────────────────
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
        approved_by:    req.user?.id ?? null,
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

  // ─────────────────────────────────────────────────────────────
  // REJECT (tidak ada perubahan)
  // ─────────────────────────────────────────────────────────────
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
        rejected_by:      req.user?.id ?? null,
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

  // ─────────────────────────────────────────────────────────────
  // DELETE
  // CHANGED: hapus SProductionPlanDetailLine sebelum hapus plan
  // ─────────────────────────────────────────────────────────────
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

      // Hapus detail lines (pivot) sebelum detail
      const details = await SProductionPlanDetail.findAll({
        where:       { plan_id: id },
        attributes:  ["id"],
        transaction: t,
      });
      const detailIds = details.map((d) => d.id);
      if (detailIds.length > 0) {
        await SProductionPlanDetailLine.destroy({
          where: { plan_detail_id: detailIds },
          transaction: t,
        });
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

  // ─────────────────────────────────────────────────────────────
  // GET DROPDOWN (tidak ada perubahan)
  // ─────────────────────────────────────────────────────────────
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