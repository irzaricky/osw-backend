import { Op } from 'sequelize';
import Joi from 'joi';
import db from '../../models/index.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';

const {
  RefTypeCalendars,
  SProductionOrder,
  SProductionOrderProduct,
  SProductionOrderSchedule,
  SProductionOrderRescheduleLog,
  SProductionPlan,
  SProductionPlanDetail,
  SProductionPlanCapacityResult,
  SProductionPlanCapacityParam,
  SWorkOrder,
  SWorkOrderStation,
  SWorkOrderMaterial,
  SBoms,
  SBomDetails,
  SCustomers,
  SParts,
  SLines,
  SFactories,
  SShifts,
  SShiftCalendars,
  SUsers,
  sequelize,
} = db;

// ─── INCLUDES ───────────────────────────────────────────────────────────────

const PO_HEADER_INCLUDE = [
  { model: SProductionPlan, as: 'plan',    attributes: ['id', 'plan_number', 'plan_description'] },
  { model: SUsers,          as: 'creator',  attributes: ['id', 'email'] },
  { model: SUsers,          as: 'releaser', attributes: ['id', 'email'] },
  { model: SUsers,          as: 'rejector', attributes: ['id', 'email'] },
];

const PO_PRODUCT_INCLUDE = [
  { model: SCustomers, as: 'customer', attributes: ['id', 'customer_code', 'name'] },
  { model: SParts,     as: 'part',     attributes: ['id', 'part_number', 'part_name'] },
  { model: SLines,     as: 'line',     attributes: ['id', 'line_code', 'name'] },
];

// ─── NUMBER GENERATORS ──────────────────────────────────────────────────────
async function generatePoNumber(t) {
  const now    = new Date();
  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `PO-${year}-${month}`;

  const last = await SProductionOrder.findOne({
    where:       { po_number: { [Op.iLike]: `${prefix}%` } },
    order:       [['po_number', 'DESC']],
    paranoid:    false,
    lock:        t.LOCK.UPDATE,
    transaction: t,
  });

  let seq = 1;
  if (last) {
    const n = parseInt(last.po_number.slice(-5), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

async function generateWoNumber(workDate, t) {
  const d      = new Date(workDate);
  const year   = d.getFullYear();
  const month  = String(d.getMonth() + 1).padStart(2, '0');
  const prefix = `WO-${year}-${month}-`;

  const last = await SWorkOrder.findOne({
    where:       { wo_number: { [Op.iLike]: `${prefix}%` } },
    order:       [['wo_number', 'DESC']],
    paranoid:    false,
    lock:        t.LOCK.UPDATE,
    transaction: t,
  });

  let seq = 1;
  if (last) {
    const n = parseInt(last.wo_number.slice(-5), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

// ─── CALENDAR & SHIFT HELPERS ───────────────────────────────────────────────
async function resolveEffectiveWorkingDaysAndShifts(lineId, planId, startDate, endDate, transaction) {
  const { SProductionPlanCalendarAdjustment } = db;

  // ── 1. Baca master calendar (non-holiday saja) ────────────────────────────
  const masterCalendars = await SShiftCalendars.findAll({
    where: {
      line_id:    lineId,
      active:     true,
      deleted_at: null,
      start_date: { [Op.lte]: endDate },
      end_date:   { [Op.gte]: startDate },
    },
    include: [
      {
        model:    SShifts,
        as:       'shift',
        where:    { type: 'REGULAR', category: 'PRODUCTIVE', active: true, deleted_at: null },
        required: true,
      },
      {
        model:      db.RefTypeCalendars,
        as:         'type_calendar',
        attributes: ['is_holiday'],
      },
    ],
    transaction,
  });

  // ── 2. Baca ADD_SHIFT adjustments dari plan ───────────────────────────────
  const shiftAdjs = await SProductionPlanCalendarAdjustment.findAll({
    where: {
      plan_id:         planId,
      adjustment_type: 'ADD_SHIFT',
      date:            { [Op.between]: [startDate, endDate] },
    },
    include: [{
      model:    SShifts,
      as:       'shift',
      where:    { type: 'REGULAR', category: 'PRODUCTIVE', active: true, deleted_at: null },
      required: true,
    }],
    transaction,
  });

  // ── 3. Baca ADD_OVERTIME adjustments dari plan ────────────────────────────
  const overtimeAdjs = await SProductionPlanCalendarAdjustment.findAll({
    where: {
      plan_id:         planId,
      adjustment_type: 'ADD_OVERTIME',
      date:            { [Op.between]: [startDate, endDate] },
    },
    include: [{
      model:    SShifts,
      as:       'shift',
      attributes: ['id', 'shift_number'],
      required: true,
    }],
    transaction,
  });

  // ── 4. Build dayShiftMap: dateStr → Map<shift_number, shiftRecord> ────────
  // Hanya hari non-holiday dari master yang dimasukkan sebagai base
  const dayShiftMap = new Map(); // dateStr → Map<shift_number, shiftRecord>

  for (const cal of masterCalendars) {
    const isHoliday = cal.type_calendar?.is_holiday ?? false;
    if (isHoliday) continue;

    const calStart = typeof cal.start_date === 'string'
      ? cal.start_date.split('T')[0]
      : new Date(cal.start_date).toISOString().split('T')[0];
    const calEnd = typeof cal.end_date === 'string'
      ? cal.end_date.split('T')[0]
      : new Date(cal.end_date).toISOString().split('T')[0];

    const fromStr = calStart < startDate ? startDate : calStart;
    const toStr   = calEnd   > endDate   ? endDate   : calEnd;

    if (fromStr > toStr) continue;

    const fromDt = new Date(fromStr + 'T00:00:00Z');
    const toDt   = new Date(toStr   + 'T00:00:00Z');

    for (let d = new Date(fromDt); d <= toDt; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr  = d.toISOString().split('T')[0];
      const shiftNum = cal.shift.shift_number;

      if (!dayShiftMap.has(dateStr)) dayShiftMap.set(dateStr, new Map());
      if (!dayShiftMap.get(dateStr).has(shiftNum)) {
        dayShiftMap.get(dateStr).set(shiftNum, cal.shift);
      }
    }
  }

  // ── 5. Tambahkan shift dari ADD_SHIFT adjustments ─────────────────────────
  // Bisa mengaktifkan hari libur (hari baru) ATAU menambah shift ekstra
  for (const adj of shiftAdjs) {
    const dateStr  = typeof adj.date === 'string' ? adj.date.split('T')[0] : new Date(adj.date).toISOString().split('T')[0];
    const shiftNum = adj.shift.shift_number;

    if (!dayShiftMap.has(dateStr)) dayShiftMap.set(dateStr, new Map());
    if (!dayShiftMap.get(dateStr).has(shiftNum)) {
      dayShiftMap.get(dateStr).set(shiftNum, adj.shift);
    }
  }

  // ── 6. Build overtimeByDateShift: `dateStr_shiftNumber` → total OT minutes ─
  const overtimeByDateShift = new Map();
  for (const adj of overtimeAdjs) {
    const shiftNum = adj.shift?.shift_number;
    if (!shiftNum) continue;
    const dateStr = typeof adj.date === 'string' ? adj.date.split('T')[0] : new Date(adj.date).toISOString().split('T')[0];
    const key     = `${dateStr}_${shiftNum}`;
    overtimeByDateShift.set(key, (overtimeByDateShift.get(key) ?? 0) + (adj.overtime_minutes ?? 0));
  }

  // ── 7. Build output ───────────────────────────────────────────────────────
  const workingDays = [...dayShiftMap.keys()].sort();

  if (workingDays.length === 0) return null;

  // Kumpulkan semua unique shifts (untuk referensi — bukan dipakai di slot builder)
  const shiftByNumber = new Map();
  for (const shiftMap of dayShiftMap.values()) {
    for (const [num, shiftRec] of shiftMap.entries()) {
      if (!shiftByNumber.has(num)) shiftByNumber.set(num, shiftRec);
    }
  }
  const allShifts = [...shiftByNumber.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, shift]) => shift);

  // dayShiftsMap: dateStr → array of shiftRecord sorted by shift_number
  const dayShiftsMap = new Map();
  for (const [dateStr, shiftMap] of dayShiftMap.entries()) {
    dayShiftsMap.set(
      dateStr,
      [...shiftMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, shift]) => shift)
    );
  }

  return { workingDays, allShifts, dayShiftsMap, overtimeByDateShift };
}

// ─── CAPACITY RESOLUTION
async function resolveCapacityPerLine(planId, lineIds, transaction) {
  const capacityResults = await SProductionPlanCapacityResult.findAll({
    where: { plan_id: planId, line_id: lineIds },
    transaction,
  });
  const resultByLine = new Map(capacityResults.map((r) => [r.line_id, r]));

  const planParams = await SProductionPlanCapacityParam.findAll({
    where: { plan_id: planId, line_id: lineIds },
    transaction,
  });
  const planParamByLine = new Map(planParams.map((p) => [p.line_id, p]));

  const map = new Map();

  for (const lineId of lineIds) {
    const param  = planParamByLine.get(lineId);
    const result = resultByLine.get(lineId);

    if (!param) {
      map.set(lineId, {
        effectiveMinPerShift: 0, maxTaktMin: 0,
        capPerShift: 0, capPerDay: 0, totalCapUnits: 0,
        shiftsPerDay: 1, workingDays: 0, maxTaktSec: 0, efficiencyFactor: 1,
      });
      continue;
    }

    const workingDays          = param.working_days;
    const shiftsPerDay         = param.shifts_per_day;
    const workingHoursPerShift = parseFloat(param.working_hours_per_shift);
    const efficiencyFactor     = parseFloat(param.efficiency_factor);

    const maxTaktSec = parseFloat(result?.max_takt_time ?? param.max_takt_time ?? 0);
    if (!maxTaktSec || maxTaktSec <= 0) {
      map.set(lineId, {
        effectiveMinPerShift: 0, maxTaktMin: 0,
        capPerShift: 0, capPerDay: 0, totalCapUnits: 0,
        shiftsPerDay, workingDays, maxTaktSec, efficiencyFactor,
      });
      continue;
    }

    const maxTaktMin           = maxTaktSec / 60;
    const effectiveMinPerShift = workingHoursPerShift * 60 * efficiencyFactor;
    const capPerShift          = Math.floor(effectiveMinPerShift / maxTaktMin);
    const capPerDay            = capPerShift * shiftsPerDay;
    const totalCapUnits        = capPerDay * workingDays;

    map.set(lineId, {
      effectiveMinPerShift,
      maxTaktMin,
      capPerShift,
      capPerDay,
      totalCapUnits,
      shiftsPerDay,
      workingDays,
      maxTaktSec,
      efficiencyFactor,
    });
  }

  return map;
}

async function resolveShiftCalendar(lineId, shiftId, productionDate, transaction) {
  const shiftRecord = await SShifts.findOne({ where: { id: shiftId }, transaction });
  const shiftNumber = shiftRecord?.shift_number ?? null;

  if (shiftNumber) {
    const byNumber = await SShiftCalendars.findOne({
      where: {
        line_id:    lineId,
        start_date: { [Op.lte]: productionDate },
        end_date:   { [Op.gte]: productionDate },
        active:     true,
        deleted_at: null,
      },
      include: [{
        model:    SShifts,
        as:       'shift',
        where:    { shift_number: shiftNumber, category: 'PRODUCTIVE' },
        required: true,
      }],
      transaction,
    });
    if (byNumber) return { cal: byNumber, isExact: true };
  }

  const exact = await SShiftCalendars.findOne({
    where: {
      line_id:    lineId,
      shift_id:   shiftId,
      start_date: { [Op.lte]: productionDate },
      end_date:   { [Op.gte]: productionDate },
      active:     true,
      deleted_at: null,
    },
    transaction,
  });
  if (exact) return { cal: exact, isExact: true };

  const nearest = await SShiftCalendars.findOne({
    where: {
      line_id:    lineId,
      start_date: { [Op.lte]: productionDate },
      active:     true,
      deleted_at: null,
    },
    order:       [['end_date', 'DESC']],
    transaction,
  });
  if (nearest) return { cal: nearest, isExact: false };

  return { cal: null, isExact: false };
}

// ─── OVERTIME FLAG DERIVATION (read-time, no DB boolean column) ────────────
function deriveOvertimeForSlotGroup(rows) {
  const sorted = [...rows].sort((a, b) => (a.row_sequence ?? 0) - (b.row_sequence ?? 0)); // Allocation order within the slot
  const regularCap = sorted[0]?.regular_cap_snapshot ?? sorted[0]?.line_capacity_per_day ?? 0; // Constant for every row in this slot
  let regularUsed = 0;
  return sorted.map((row) => {
    const qty = row.planned_qty_per_day ?? 0;
    const regularPortion = Math.max(0, Math.min(qty, regularCap - regularUsed)); // Units of this row still covered by regular capacity
    const overtimeQty = qty - regularPortion; // Remainder spills into overtime
    regularUsed += regularPortion;
    return { ...row, has_overtime: overtimeQty > 0, overtime_qty: overtimeQty };
  });
}

function deriveOvertimeFlags(scheduleRows) {
  const groups = new Map(); // Group rows by the slot they were allocated from
  for (const row of scheduleRows) {
    const key = `${row.production_date}_${row.shift_id}_${row.line_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = [];
  for (const groupRows of groups.values()) result.push(...deriveOvertimeForSlotGroup(groupRows));
  return result;
}

// ─── CAPACITY SLOT BUILDER ──────────────────────────────────────────────────
function buildShiftSlotMap(dayShiftsMap, capPerShift, maxTaktMin, efficiencyFactor, overtimeByDateShift) {
  // slot value: { regularCap, overtimeCap, totalCap, hasOvertime }
  const slotMap = new Map();

  if (!dayShiftsMap || capPerShift <= 0) return slotMap;

  for (const [date, shifts] of dayShiftsMap.entries()) {
    for (const shift of shifts) {
      const slotKey     = `${date}_${shift.shift_number}`;
      const otMinutes   = overtimeByDateShift?.get(slotKey) ?? 0;
      const overtimeCap = otMinutes > 0 && maxTaktMin > 0 && efficiencyFactor > 0
        ? Math.floor((otMinutes * efficiencyFactor) / maxTaktMin)
        : 0;
      const totalCap = capPerShift + overtimeCap;

      slotMap.set(slotKey, {
        regularCap:  capPerShift,
        overtimeCap,
        totalCap,
        hasOvertime: overtimeCap > 0,
      });
    }
  }

  return slotMap;
}

// ─── LEVELED TARGET MAP BUILDER ─────────────────────────────────────────────
function buildLeveledTargetMap(products, workingDaysByLine, shiftsByLine, initialSlotMapByLine) {
  const targetMap = new Map();
  for (const p of products) targetMap.set(p.id, new Map());

  const productsByLine = new Map();
  for (const p of products) {
    if (!productsByLine.has(p.line_id)) productsByLine.set(p.line_id, []);
    productsByLine.get(p.line_id).push(p);
  }

  for (const [lineId, lineProducts] of productsByLine.entries()) {
    const days    = workingDaysByLine.get(lineId) ?? [];
    const shifts  = shiftsByLine.get(lineId)      ?? [];
    const slotMap = initialSlotMapByLine.get(lineId);

    if (!slotMap || !days.length || !shifts.length) continue;

    const totalCap = [...slotMap.values()].reduce((s, v) => s + v, 0);
    if (totalCap === 0) continue;

    const remainingQtyMap = new Map(lineProducts.map((p) => [p.id, p.planned_qty]));

    const queue = [...lineProducts].sort(
      (a, b) => (a.sequence ?? 1) - (b.sequence ?? 1)
             || new Date(a.delivery_date) - new Date(b.delivery_date)
    );
    let queueIdx = 0;

    for (const date of days) {
      for (const shift of shifts) {
        const slotKey = `${date}_${shift.shift_number}`;
        let capLeft   = slotMap.get(slotKey) ?? 0;
        if (capLeft <= 0) continue;

        let safetyBreak = 0;

        while (capLeft > 0 && safetyBreak < lineProducts.length * 2) {
          safetyBreak++;

          let foundActive = false;
          for (let attempt = 0; attempt < queue.length; attempt++) {
            const idx = (queueIdx + attempt) % queue.length;
            const p   = queue[idx];
            const rem = remainingQtyMap.get(p.id) ?? 0;
            if (rem > 0) {
              queueIdx    = idx;
              foundActive = true;
              break;
            }
          }
          if (!foundActive) break;

          const activeProduct = queue[queueIdx];
          const rem           = remainingQtyMap.get(activeProduct.id) ?? 0;
          const allocSlot     = Math.min(rem, capLeft);

          if (allocSlot > 0) {
            const productTargetMap = targetMap.get(activeProduct.id);
            const existing         = productTargetMap.get(slotKey) ?? 0;
            productTargetMap.set(slotKey, existing + allocSlot);
            remainingQtyMap.set(activeProduct.id, rem - allocSlot);
            capLeft -= allocSlot;
          }

          queueIdx = (queueIdx + 1) % queue.length;
        }
      }
    }

    for (const p of lineProducts) {
      const totalTarget = [...(targetMap.get(p.id)?.values() ?? [])].reduce((s, v) => s + v, 0);
      if (totalTarget !== p.planned_qty) {
        console.warn(
          `[buildLeveledTargetMap] Line ${lineId}: Target mismatch product id=${p.id} ` +
          `(plan_detail_id=${p.plan_detail_id}): ` +
          `expected=${p.planned_qty}, got=${totalTarget}, diff=${p.planned_qty - totalTarget}.`
        );
      }
    }
  }

  return targetMap;
}

// ─── SCHEDULER ─────────────────────────────────
function buildSchedule({
  products,
  workingDaysByLine,
  dayShiftsMapByLine,
  initialSlotMapByLine,
  lineByIdMap,
  po_id,
}) {
  const scheduleRows = [];
  const errors       = [];
  let   globalSeq    = 0;

  // Deep copy slot map agar tidak mutasi original
  const slotRemainingCap = new Map();
  for (const [lineId, slotMap] of initialSlotMapByLine.entries()) {
    const copy = new Map();
    for (const [key, slot] of slotMap.entries()) {
      copy.set(key, { ...slot });
    }
    slotRemainingCap.set(lineId, copy);
  }

  // Sort produk: prioritas sequence lalu delivery_date
  const sortedProducts = [...products].sort(
    (a, b) => (a.sequence ?? 1) - (b.sequence ?? 1)
           || new Date(a.delivery_date) - new Date(b.delivery_date)
  );

  for (const product of sortedProducts) {
    const lineId      = product.line_id;
    const slotMap     = slotRemainingCap.get(lineId);
    const initialSlotMap = initialSlotMapByLine.get(lineId); // Constant totals, never mutated — source of truth for reporting fields
    const days        = workingDaysByLine.get(lineId) ?? [];
    const lineObj     = lineByIdMap.get(lineId);
    const dayShiftsMap = dayShiftsMapByLine.get(lineId);

    if (!slotMap || !dayShiftsMap) {
      errors.push(`Line ID ${lineId} missing slot config for product id=${product.id}.`);
      continue;
    }

    let remainingQty = product.planned_qty;

    for (const date of days) {
      if (remainingQty <= 0) break;

      const dayShifts = dayShiftsMap.get(date) ?? [];

      for (const shift of dayShifts) {
        if (remainingQty <= 0) break;

        const slotKey = `${date}_${shift.shift_number}`;
        const slot    = slotMap.get(slotKey);
        if (!slot || slot.totalCap <= 0) continue;

        const constSlot  = initialSlotMap.get(slotKey); // Full, un-mutated slot for this date+shift
        const plannedQty = Math.min(remainingQty, slot.totalCap);

        scheduleRows.push({
          po_id,
          po_product_id:         product.id,
          row_sequence:          globalSeq++,
          production_date:       date,
          line_id:               lineId,
          shift_id:              shift.id ?? null,
          part_id:               product.part_id,
          sequence:              product.sequence ?? 1,
          planned_qty_per_day:   plannedQty,
          actual_qty_per_day:    0,
          line_capacity_per_day: constSlot.totalCap, // Full slot capacity, constant across all rows sharing this slot
          regular_cap_snapshot:  constSlot.regularCap, // Full regular-only capacity, constant across all rows sharing this slot
          utilization_pct:       Math.round((plannedQty / constSlot.totalCap) * 10000) / 100,
          status:                'Scheduled',
          line_name_snapshot:    lineObj?.name ?? null,
          shift_name_snapshot:   shift.name ?? null,
          // Transient flags — not persisted directly, only used to build the generateSchedule response summary
          _has_overtime:         constSlot.hasOvertime,
          _overtime_cap:         constSlot.overtimeCap,
        });

        // Kurangi sisa kapasitas slot
        const used      = plannedQty;
        slot.totalCap  -= used;
        slot.regularCap = Math.max(0, slot.regularCap - used);
        remainingQty   -= used;
      }
    }

    if (remainingQty > 0) {
      errors.push(
        `[KAPASITAS PARSIAL] Line ${lineId} part_id=${product.part_id}: ` +
        `${remainingQty} unit tidak terjadwal. ` +
        `Kapasitas habis — tambahkan hari kerja atau shift pada plan.`
      );
    }
  }

  // Hitung completion date per produk
  const stageCompletionDate = new Map();
  for (const row of scheduleRows) {
    const existing = stageCompletionDate.get(row.po_product_id);
    if (!existing || row.production_date > existing) {
      stageCompletionDate.set(row.po_product_id, row.production_date);
    }
  }

  return { scheduleRows, errors, stageCompletionDate };
}

// ─── VALIDATORS ─────────────────────────────────────────────────────────────
function validateCapacityBeforeScheduling(products, capacityInfoByLine, lineByIdMap) {
  const violations = [];

  const demandByLine = new Map();
  for (const p of products) {
    const prev = demandByLine.get(p.line_id) ?? 0;
    demandByLine.set(p.line_id, prev + p.planned_qty);
  }

  for (const [lineId, totalDemand] of demandByLine.entries()) {
    const info     = capacityInfoByLine.get(lineId);
    const lineName = lineByIdMap.get(lineId)?.name ?? `Line ID ${lineId}`;

    if (!info || info.totalCapUnits <= 0) {
      violations.push({
        line_id: lineId, line_name: lineName, total_demand: totalDemand, total_capacity: 0,
        shortage: totalDemand, severity: 'FATAL',
        message: `Lini "${lineName}" (ID ${lineId}) tidak memiliki kapasitas terhitung.`,
      });
      continue;
    }

    if (totalDemand > info.totalCapUnits) {
      const shortage             = totalDemand - info.totalCapUnits;
      const additionalDaysNeeded = Math.ceil(shortage / info.capPerDay);
      violations.push({
        line_id: lineId, line_name: lineName, total_demand: totalDemand,
        total_capacity: info.totalCapUnits, shortage, cap_per_day: info.capPerDay,
        additional_days_needed: additionalDaysNeeded, severity: 'OVERCOMMIT',
        message:
          `Kapasitas Lini "${lineName}" (ID ${lineId}) TIDAK MENCUKUPI: ` +
          `demand=${totalDemand} unit > kapasitas=${info.totalCapUnits} unit ` +
          `(kekurangan ${shortage} unit ≈ ${additionalDaysNeeded} hari kerja tambahan).`,
      });
    }
  }

  return violations;
}

async function validateScheduleIntegrity(po, products, transaction) {
  for (const product of products) {
    const scheduledSum = await SProductionOrderSchedule.sum('planned_qty_per_day', {
      where:       { po_id: po.id, po_product_id: product.id },
      transaction,
    });
    if ((scheduledSum ?? 0) !== product.planned_qty) {
      return {
        ok: false,
        error:
          `Scheduled qty (${scheduledSum ?? 0}) does not match planned qty ` +
          `(${product.planned_qty}) for product id=${product.id} on ` +
          `line_id=${product.line_id} (stage ${product.sequence}). Regenerate the schedule.`,
      };
    }
  }

  const schedules = await SProductionOrderSchedule.findAll({
    where:       { po_id: po.id },
    attributes:  ['po_product_id', 'sequence', 'production_date', 'planned_qty_per_day'],
    order:       [['sequence', 'ASC'], ['production_date', 'ASC']],
    transaction,
  });

  const productById = new Map(products.map((p) => [p.id, p]));

  const stageDateRange = new Map();
  for (const sch of schedules) {
    const prod = productById.get(sch.po_product_id);
    if (!prod) continue;

    const detailId = prod.plan_detail_id;
    const stage    = sch.sequence;
    const date     = sch.production_date;

    if (!stageDateRange.has(detailId)) stageDateRange.set(detailId, new Map());
    const cur = stageDateRange.get(detailId).get(stage) ?? { firstDate: date, lastDate: date };
    stageDateRange.get(detailId).set(stage, {
      firstDate: date < cur.firstDate ? date : cur.firstDate,
      lastDate:  date > cur.lastDate  ? date : cur.lastDate,
    });
  }

  for (const [detailId, stageMap] of stageDateRange.entries()) {
    const sortedStages = [...stageMap.keys()].sort((a, b) => a - b);

    for (let i = 1; i < sortedStages.length; i++) {
      const prevStage = sortedStages[i - 1];
      const currStage = sortedStages[i];
      const prev      = stageMap.get(prevStage);
      const curr      = stageMap.get(currStage);

      if (curr.lastDate < prev.firstDate) {
        return {
          ok: false,
          error:
            `Stage ordering anomaly for plan_detail_id=${detailId}: ` +
            `stage ${currStage} starts (${curr.firstDate}) before ` +
            `stage ${prevStage} starts (${prev.firstDate}). Regenerate the schedule.`,
        };
      }
    }
  }

  return { ok: true };
}

// ─── MODULE ─────────────────────────────────────────────────────────────────
class OrderScheduleModule extends BaseModule {

  async list(req, res) {
    try {
      const { limit, page, offset } = helper.getPagination(req.query);
      const { search = '', status, plan_id } = req.query;

      const where = { deleted_at: null };
      if (search) {
        where[Op.or] = [
          { po_number:      { [Op.iLike]: `%${search}%` } },
          { po_description: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (status)  where.status  = status;
      if (plan_id) where.plan_id = plan_id;

      const { count, rows } = await SProductionOrder.findAndCountAll({
        where,
        limit,
        offset,
        include:  PO_HEADER_INCLUDE,
        order:    [['created_at', 'DESC']],
        distinct: true,
      });

      // On-the-fly: total_products & total_planned_qty per PO
      const poIds = rows.map((r) => r.id);
      const aggMap = new Map();
      if (poIds.length > 0) {
        const allProducts = await SProductionOrderProduct.findAll({
          where:      { po_id: poIds },
          attributes: ['po_id', 'part_id', 'planned_qty', 'scheduled_qty'],
        });
        for (const p of allProducts) {
          if (!aggMap.has(p.po_id)) aggMap.set(p.po_id, { parts: new Set(), total_qty: 0, qty_scheduled: 0 });
          const entry = aggMap.get(p.po_id);
          entry.parts.add(p.part_id);
          entry.total_qty += p.planned_qty;
          entry.qty_scheduled += p.scheduled_qty;
        }
      }

      const data = rows.map((r) => {
        const agg = aggMap.get(r.id);
        return {
          ...r.toJSON(),
          total_products:    agg ? agg.parts.size : 0,
          total_planned_qty: agg ? agg.total_qty  : 0,
          total_scheduled_qty: agg ? agg.qty_scheduled : 0,
        };
      });

      return helper.sendResponse(res, {
        status: true,
        code:   200,
        data:   helper.getPaginationData(data, count, page, limit),
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
        where:   { id, deleted_at: null },
        include: PO_HEADER_INCLUDE,
      });

      if (!po) {
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }

      const [products, schedules, rescheduleLogs] = await Promise.all([
        SProductionOrderProduct.findAll({
          where:   { po_id: id },
          include: PO_PRODUCT_INCLUDE,
          order: [['delivery_date', 'ASC'], ['sequence', 'ASC']],
        }),
        SProductionOrderSchedule.findAll({
          where:   { po_id: id },
          include: [
            { model: SShifts, as: 'shift', attributes: ['id', 'name', 'start_time', 'end_time'] },
            { model: SParts,  as: 'part',  attributes: ['id', 'part_number', 'part_name'] },
            { model: SLines,  as: 'line',  attributes: ['id', 'line_code', 'name'] },
          ],
          order: [['production_date', 'ASC'], ['sequence', 'ASC']],
        }),
        SProductionOrderRescheduleLog.findAll({
          where: { po_id: id },
          order: [['rescheduled_at', 'DESC']],
          limit: 20,
        }),
      ]);

      const total_products    = new Set(products.map((p) => p.part_id)).size;
      const total_planned_qty = products.reduce((s, p) => s + p.planned_qty, 0);
      const total_scheduled_qty = schedules.reduce((s, r) => s + r.planned_qty_per_day, 0);

      // Derive overtime flag per row, accounting for cumulative regular usage within each shared slot
      const schedulesWithOvertime = deriveOvertimeFlags(schedules.map((r) => r.toJSON()));

      return helper.sendResponse(res, {
        status: true,
        code:   200,
        data:   {
          ...po.toJSON(),
          total_products,
          total_planned_qty,
          total_scheduled_qty,
          products,
          schedules: schedulesWithOvertime,
          reschedule_logs: rescheduleLogs,
        },
      });
    } catch (error) {
      console.log('[OrderScheduleModule][detail]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const schema = Joi.object({
        plan_id:               Joi.number().integer().required(),
        production_start_date: Joi.date().iso().required(),
        production_end_date:   Joi.date().iso().required(),
        po_description:        Joi.string().optional().allow('', null),
        priority:              Joi.string().valid('Low', 'Medium', 'High').default('Medium'),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { plan_id, production_start_date, production_end_date, po_description, priority } =
        validation.value;

      const plan = await SProductionPlan.findOne({
        where: { id: plan_id, status: 'Approved', deleted_at: null },
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Production Plan not found or not in Approved status',
        });
      }

      const existingPO = await SProductionOrder.findOne({
        where: { plan_id, status: { [Op.notIn]: ['Cancelled'] }, deleted_at: null },
        transaction: t,
      });
      if (existingPO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `An active Production Order (${existingPO.po_number}) already exists for this plan. Cancel it first.`,
        });
      }

      const startDt  = new Date(production_start_date);
      const endDt    = new Date(production_end_date);
      const latestDO = plan.latest_delivery_date ? new Date(plan.latest_delivery_date) : null;

      if (endDt <= startDt) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'production_end_date must be after production_start_date',
        });
      }
      if (latestDO && endDt > latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `production_end_date must not exceed the latest delivery date (${plan.latest_delivery_date})`,
        });
      }

      const po_number = await generatePoNumber(t);

      // Single-line: assigned_line_id & routing_id langsung dari plan_detail
      const planDetails = await SProductionPlanDetail.findAll({
        where:       { plan_id, deleted_at: null },
        order:       [['sequence', 'ASC']],
        transaction: t,
      });

      if (!planDetails.length) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Production Plan has no detail items',
        });
      }

      const unroutedDetails = planDetails.filter((d) => !d.assigned_line_id);
      if (unroutedDetails.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `${unroutedDetails.length} plan detail(s) have no routing/line configured.`,
        });
      }

      const po = await SProductionOrder.create({
        po_number,
        plan_id,
        production_start_date:  startDt.toISOString().split('T')[0],
        production_end_date:    endDt.toISOString().split('T')[0],
        earliest_delivery_date: plan.earliest_delivery_date,
        latest_delivery_date:   plan.latest_delivery_date,
        priority,
        po_description,
        status:     'Draft',
        created_by: req.user?.id ?? null,
      }, { transaction: t });

      // Satu baris per plan_detail (single-line)
      const productRows = planDetails.map((detail) => ({
        po_id:          po.id,
        plan_detail_id: detail.id,
        sequence:       1,
        customer_id:    detail.customer_id,
        part_id:        detail.part_id,
        line_id:        detail.assigned_line_id,
        delivery_date:  detail.delivery_date,
        planned_qty:    detail.qty_request,
      }));

      await SProductionOrderProduct.bulkCreate(productRows, { transaction: t });

      const lineCount = new Set(productRows.map((r) => r.line_id)).size;

      // On-the-fly summary
      const total_products    = new Set(productRows.map((r) => r.part_id)).size;
      const total_planned_qty = productRows.reduce((s, r) => s + r.planned_qty, 0);

      await this.logActivity(req, {
        moduleCode:   'production_order',
        activityCode: 'CREATE',
        resourceId:   po.id,
        newData:      po,
        description:  `Created Production Order ${po_number} — ` +
                      `${productRows.length} product row(s) across ${lineCount} line(s)`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    201,
        message: 'Production Order created successfully',
        data: {
          id:                po.id,
          po_number:         po.po_number,
          total_products,
          total_planned_qty,
          product_line_rows: productRows.length,
          lines_count:       lineCount,
        },
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
        po_description:        Joi.string().optional().allow('', null),
        priority:              Joi.string().valid('Low', 'Medium', 'High').optional(),
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

      const { production_start_date, production_end_date } = validation.value;
      const endDt    = production_end_date   ? new Date(production_end_date)   : new Date(po.data.production_end_date);
      const startDt  = production_start_date ? new Date(production_start_date) : new Date(po.data.production_start_date);
      const latestDO = po.data.latest_delivery_date ? new Date(po.data.latest_delivery_date) : null;

      if (endDt <= startDt) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'production_end_date must be after production_start_date',
        });
      }
      if (latestDO && endDt > latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `production_end_date must not exceed the latest delivery date (${po.data.latest_delivery_date})`,
        });
      }

      const datesChanged = !!(production_start_date || production_end_date);
      const oldData      = po.data.toJSON();
      await po.data.update(validation.value, { transaction: t });

      if (datesChanged) {
        const existing = await SProductionOrderSchedule.count({ where: { po_id: id }, transaction: t });
        if (existing > 0) {
          await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
          await SProductionOrderProduct.update({ scheduled_qty: 0 }, { where: { po_id: id }, transaction: t });
        }
      }

      await this.logActivity(req, {
        moduleCode:   'production_order',
        activityCode: 'UPDATE',
        resourceId:   po.data.id,
        oldData,
        newData:      po.data,
        description:  `Updated Production Order ${po.data.po_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: datesChanged
          ? 'Production Order updated. Existing schedules were cleared — please regenerate the schedule.'
          : 'Production Order updated successfully',
        data: { id: po.data.id, po_number: po.data.po_number },
      });
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
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Only Draft Production Orders can be deleted',
        });
      }

      await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
      await SProductionOrderRescheduleLog.destroy({ where: { po_id: id }, transaction: t });
      await SProductionOrderProduct.destroy({ where: { po_id: id }, transaction: t });

      const oldData = po.toJSON();
      await po.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode:   'production_order',
        activityCode: 'DELETE',
        resourceId:   po.id,
        oldData,
        description:  `Deleted Production Order ${po.po_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Production Order deleted successfully' });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][delete]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async generateSchedule(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
  
      const po = await this._getPoEditable(id, t);
      if (!po.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: po.code, error: po.error });
      }
  
      const products = await SProductionOrderProduct.findAll({
        where:       { po_id: id },
        order:       [['sequence', 'ASC'], ['delivery_date', 'ASC']],
        transaction: t,
      });
  
      if (!products.length) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'No products found in this Production Order',
        });
      }
  
      const unassigned = products.filter((p) => !p.line_id);
      if (unassigned.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `${unassigned.length} product row(s) have no line assigned.`,
        });
      }
  
      // Single-line: lineIds selalu satu elemen
      const lineIds = [...new Set(products.map((p) => p.line_id))];
  
      // ── 1. Resolve capacity params dari plan ────────────────────────────────
      const capacityInfoByLine = await resolveCapacityPerLine(po.data.plan_id, lineIds, t);
  
      for (const lineId of lineIds) {
        const info = capacityInfoByLine.get(lineId);
        if (!info || info.capPerShift === 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  `Line ID ${lineId} has zero capacity per shift. ` +
                    `Check max_takt_time and working_hours configuration.`,
          });
        }
      }
  
      // ── 2. Resolve hari kerja efektif + shift per hari + overtime ───────────
      // Menggabungkan master calendar + ADD_SHIFT + ADD_OVERTIME adjustments dari plan
      const workingDaysByLine      = new Map();
      const dayShiftsMapByLine     = new Map();
      const overtimeByDateShiftByLine = new Map();
  
      for (const lineId of lineIds) {
        const result = await resolveEffectiveWorkingDaysAndShifts(
          lineId,
          po.data.plan_id,
          po.data.production_start_date,
          po.data.production_end_date,
          t,
        );
  
        if (!result || result.workingDays.length === 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  `Tidak ada hari kerja aktif untuk line ID ${lineId} dalam rentang ` +
                    `[${po.data.production_start_date} ~ ${po.data.production_end_date}]. ` +
                    `Pastikan shift calendar sudah dikonfigurasi.`,
          });
        }
  
        workingDaysByLine.set(lineId, result.workingDays);
        dayShiftsMapByLine.set(lineId, result.dayShiftsMap);
        overtimeByDateShiftByLine.set(lineId, result.overtimeByDateShift);
      }
  
      // ── 3. Load line master data ────────────────────────────────────────────
      const lineRows    = await SLines.findAll({ where: { id: lineIds }, transaction: t });
      const lineByIdMap = new Map(lineRows.map((l) => [l.id, l]));
  
      // ── 4. Build slot map per line (dengan overtime) ────────────────────────
      const initialSlotMapByLine = new Map();
  
      for (const lineId of lineIds) {
        const info                = capacityInfoByLine.get(lineId);
        const dayShiftsMap        = dayShiftsMapByLine.get(lineId);
        const overtimeByDateShift = overtimeByDateShiftByLine.get(lineId) ?? new Map();
  
        const slotMap = buildShiftSlotMap(
          dayShiftsMap,
          info.capPerShift,
          info.maxTaktMin,
          info.efficiencyFactor,
          overtimeByDateShift,
        );
        initialSlotMapByLine.set(lineId, slotMap);
      }
  
      // ── 5. Validasi total kapasitas tidak nol ──────────────────────────────
      for (const lineId of lineIds) {
        const slotMap  = initialSlotMapByLine.get(lineId) ?? new Map();
        const totalCap = [...slotMap.values()].reduce((s, slot) => s + slot.totalCap, 0);
        if (totalCap === 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  `Line ID ${lineId} has zero total capacity across all working days/shifts.`,
          });
        }
      }
  
      // ── 6. Validasi kapasitas sebelum scheduling ───────────────────────────
      const capacityViolations = validateCapacityBeforeScheduling(
        products, capacityInfoByLine, lineByIdMap
      );
      if (capacityViolations.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status:     false,
          code:       400,
          error:      `Kapasitas tidak mencukupi pada ${capacityViolations.length} lini.`,
          violations: capacityViolations.map((v) => ({
            line_id:                v.line_id,
            line_name:              v.line_name,
            severity:               v.severity,
            total_demand:           v.total_demand,
            total_capacity:         v.total_capacity,
            shortage:               v.shortage,
            additional_days_needed: v.additional_days_needed,
            message:                v.message,
          })),
        });
      }
  
      // ── 7. Clear schedule lama ──────────────────────────────────────────────
      await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
      await SProductionOrderProduct.update({ scheduled_qty: 0 }, { where: { po_id: id }, transaction: t });
  
      // ── 8. Generate schedule ────────────────────────────────────────────────
      const { scheduleRows, errors, stageCompletionDate } = buildSchedule({
        products,
        workingDaysByLine,
        dayShiftsMapByLine,
        initialSlotMapByLine,
        lineByIdMap,
        po_id: id,
      });
  
      const partialErrors = errors.filter((e) => e.includes('KAPASITAS PARSIAL'));
      const fatalErrors   = errors.filter((e) => e.includes('missing slot config'));
  
      if (fatalErrors.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code:   400,
          error:  `Penjadwalan gagal karena konfigurasi slot tidak ditemukan.`,
          errors: fatalErrors,
        });
      }
  
      // ── 9. Simpan ke DB — strip field _has_overtime dan _overtime_cap ───────
      const overtimeSummary = scheduleRows
        .filter((r) => r._has_overtime)
        .map((r) => ({
          date:         r.production_date,
          shift_id:     r.shift_id,
          overtime_cap: r._overtime_cap,
        }));
  
      const rowsToInsert = scheduleRows.map(({ _has_overtime, _overtime_cap, ...rest }) => rest);
      await SProductionOrderSchedule.bulkCreate(rowsToInsert, { transaction: t });
  
      // ── 10. Update scheduled_qty per produk ────────────────────────────────
      const scheduledByProduct = new Map();
      for (const row of scheduleRows) {
        scheduledByProduct.set(
          row.po_product_id,
          (scheduledByProduct.get(row.po_product_id) ?? 0) + row.planned_qty_per_day,
        );
      }
      for (const [productId, qty] of scheduledByProduct.entries()) {
        await SProductionOrderProduct.update(
          { scheduled_qty: qty },
          { where: { id: productId }, transaction: t }
        );
      }
  
      // ── 11. Build summary untuk response ───────────────────────────────────
      const completionSummary = Object.fromEntries(stageCompletionDate.entries());
  
      const capacitySummary = Object.fromEntries(
        [...capacityInfoByLine.entries()].map(([lid, info]) => [lid, {
          cap_per_shift:           info.capPerShift,
          cap_per_day:             info.capPerDay,
          total_cap_units:         info.totalCapUnits,
          shifts_per_day:          info.shiftsPerDay,
          working_days_effective:  info.workingDays,
          effective_min_per_shift: parseFloat((info.effectiveMinPerShift ?? 0).toFixed(4)),
        }])
      );
  
      await this.logActivity(req, {
        moduleCode:   'production_order',
        activityCode: 'GENERATE_SCHEDULE',
        resourceId:   po.data.id,
        newData:      { schedule_count: rowsToInsert.length },
        description:  `Generated ${rowsToInsert.length} schedule rows for PO ${po.data.po_number}`,
        transaction:  t,
      });
  
      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: `Schedule generated: ${rowsToInsert.length} row(s) across ${lineIds.length} line(s).`,
        data: {
          schedule_count:       rowsToInsert.length,
          lines_used:           lineIds.length,
          production_end_date:  po.data.production_end_date,
          product_completion:   completionSummary,
          working_days_by_line: Object.fromEntries(
            [...workingDaysByLine.entries()].map(([lid, days]) => [lid, days.length])
          ),
          capacity_by_line: capacitySummary,
          overtime_slots:   overtimeSummary.length > 0 ? overtimeSummary : undefined,
          warnings:         partialErrors.length > 0 ? partialErrors : undefined,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][generateSchedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async updateSchedule(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id, schedule_id } = req.params;

      const schema = Joi.object({
        production_date:     Joi.date().iso().optional(),
        shift_id:            Joi.number().integer().optional(),
        planned_qty_per_day: Joi.number().integer().min(1).optional(),
        notes:               Joi.string().optional().allow('', null),
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

      const schedule = await SProductionOrderSchedule.findOne({
        where: { id: schedule_id, po_id: id },
        transaction: t,
      });
      if (!schedule) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Schedule row not found' });
      }

      const { production_date, shift_id, planned_qty_per_day } = validation.value;

      if (production_date) {
        const pd      = new Date(production_date);
        const poStart = new Date(po.data.production_start_date);
        const poEnd   = new Date(po.data.production_end_date);
        if (pd < poStart || pd > poEnd) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  `production_date must be within PO range (${po.data.production_start_date} ~ ${po.data.production_end_date})`,
          });
        }
      }

      if (shift_id) {
        const shift = await SShifts.findOne({
          where: { id: shift_id, type: 'REGULAR', category: 'PRODUCTIVE', active: true, deleted_at: null },
          transaction: t,
        });
        if (!shift) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  'shift_id does not reference an active REGULAR PRODUCTIVE shift',
          });
        }
      }

      if (planned_qty_per_day !== undefined) {
        const otherRowsSum = await SProductionOrderSchedule.sum('planned_qty_per_day', {
          where: {
            po_id:         id,
            po_product_id: schedule.po_product_id,
            id:            { [Op.ne]: schedule_id },
          },
          transaction: t,
        });
      
        const product = await SProductionOrderProduct.findOne({
          where: { id: schedule.po_product_id }, transaction: t,
        });
      
        const newTotal = (otherRowsSum ?? 0) + planned_qty_per_day;
        if (newTotal > product.planned_qty) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error:  `Total scheduled qty (${newTotal}) akan melebihi planned qty (${product.planned_qty}).`,
          });
        }
      }

      await schedule.update(validation.value, { transaction: t });

      const schedSum = await SProductionOrderSchedule.sum('planned_qty_per_day', {
        where: { po_id: id, po_product_id: schedule.po_product_id }, transaction: t,
      });
      await SProductionOrderProduct.update(
        { scheduled_qty: schedSum || 0 },
        { where: { id: schedule.po_product_id }, transaction: t }
      );

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: 'Schedule row updated.',
        data:    schedule,
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][updateSchedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async submit(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({
        where:       { id, deleted_at: null },
        include:     [{ model: SProductionPlan, as: 'plan', attributes: ['latest_delivery_date'] }],
        transaction: t,
      });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Draft') {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Only Draft Production Orders can be submitted',
        });
      }

      const latestDO = po.plan?.latest_delivery_date ? new Date(po.plan.latest_delivery_date) : null;
      const endDt    = new Date(po.production_end_date);
      if (latestDO && endDt > latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `production_end_date (${po.production_end_date}) must not exceed the latest delivery date (${po.plan.latest_delivery_date})`,
        });
      }

      const scheduleCount = await SProductionOrderSchedule.count({ where: { po_id: id }, transaction: t });
      if (scheduleCount === 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'No schedule generated. Run Generate Schedule first.',
        });
      }

      const products  = await SProductionOrderProduct.findAll({ where: { po_id: id }, transaction: t });
      const integrity = await validateScheduleIntegrity(po, products, t);
      if (!integrity.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: integrity.error });
      }

      const oldData = po.toJSON();
      await po.update({ status: 'Pending_Approval' }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   'production_order',
        activityCode: 'SUBMIT',
        resourceId:   po.id,
        oldData,
        newData:      po,
        description:  `Submitted Production Order ${po.po_number} for approval`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: 'Production Order submitted for approval',
        data:    { id: po.id, po_number: po.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][submit]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async approve(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id }     = req.params;
      const schema     = Joi.object({ notes: Joi.string().optional().allow('', null) });
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
      if (po.status !== 'Pending_Approval') {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Production Order is not pending approval',
        });
      }

      const oldData = po.toJSON();
      await po.update({
        status: 'Approved',
        notes:  validation.value.notes ?? po.notes,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   'production_order',
        activityCode: 'APPROVE',
        resourceId:   po.id,
        oldData,
        newData:      po,
        description:  `Approved Production Order ${po.po_number}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: 'Production Order approved successfully',
        data:    { id: po.id, po_number: po.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][approve]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async reject(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id }     = req.params;
      const schema     = Joi.object({ notes: Joi.string().required() });
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
      if (po.status !== 'Pending_Approval') {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Production Order is not pending approval',
        });
      }

      const oldData = po.toJSON();
      await po.update({
        status:      'Draft',
        notes:       validation.value.notes,
        rejected_by: req.user?.id ?? null,
        rejected_at: new Date(),
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   'production_order',
        activityCode: 'REJECT',
        resourceId:   po.id,
        oldData,
        newData:      po,
        description:  `Rejected Production Order ${po.po_number} — returned to Draft`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: 'Production Order rejected and returned to Draft',
        data:    { id: po.id, po_number: po.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][reject]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async release(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({
        where:       { id, deleted_at: null },
        transaction: t,
      });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Approved') {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `Cannot release Production Order with status '${po.status}'. PO must be Approved first.`,
        });
      }

      const schedules = await SProductionOrderSchedule.findAll({
        where:       { po_id: po.id },
        transaction: t,
      });
      if (schedules.length === 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Cannot release without schedules. Generate and submit the schedule first.',
        });
      }

      const poProducts = await SProductionOrderProduct.findAll({
        where:       { po_id: po.id },
        transaction: t,
      });
      const prodMap = Object.fromEntries(poProducts.map((p) => [p.id, p]));

      // Pre-fetch stations per line
      const lineIds        = [...new Set(schedules.map((s) => s.line_id))];
      const stationsByLine = new Map();
      for (const lineId of lineIds) {
        const stations = await db.SStations.findAll({
          where:       { line_id: lineId, status: true, deleted_at: null },
          order:       [['sequence', 'ASC']],
          transaction: t,
        });
        stationsByLine.set(lineId, stations);
      }

      await SWorkOrder.destroy({
        where:       { po_id: po.id, status: 'Draft' },
        transaction: t,
      });

      for (const sched of schedules) {
        const poProd = prodMap[sched.po_product_id];
        if (!poProd) {
          throw new Error(`Missing PO Product record for schedule id=${sched.id}`);
        }

        const { cal: shiftCal, isExact } = await resolveShiftCalendar(
          sched.line_id,
          sched.shift_id,
          sched.production_date,
          t,
        );
        if (!shiftCal) {
          throw new Error(
            `No shift calendar found for line ${sched.line_id} on date ${sched.production_date}.`
          );
        }
        if (!isExact) {
          console.warn(
            `[Release] Line ${sched.line_id} date=${sched.production_date}: ` +
            `using nearest shift calendar id=${shiftCal.id} (extra working day from plan adjustment)`
          );
        }

        const woNumber = await generateWoNumber(sched.production_date, t);

        const createdWo = await SWorkOrder.create({
          wo_number:           woNumber,
          po_id:               po.id,
          po_schedule_id:      sched.id,
          part_id:             poProd.part_id,
          line_id:             sched.line_id,
          shift_id:            sched.shift_id,
          work_date:           sched.production_date,
          planned_quantity:    sched.planned_qty_per_day,
          actual_quantity:     0,
          status:              'Released',
          sequence:            sched.sequence,
          line_name_snapshot:  sched.line_name_snapshot  ?? null,
          shift_name_snapshot: sched.shift_name_snapshot ?? null,
        }, { transaction: t });

        // Insert SWorkOrderStation (tanpa SWorkOrderStationJob — tabel dihapus)
        const lineStations = stationsByLine.get(sched.line_id) ?? [];
        if (lineStations.length === 0) {
          console.warn(
            `[Release] Line ${sched.line_id} tidak memiliki station aktif. ` +
            `WO ${woNumber} dibuat tanpa SWorkOrderStation.`
          );
        }

        for (const station of lineStations) {
          await SWorkOrderStation.create({
            wo_id:            createdWo.id,
            station_id:       station.id,
            sequence:         station.sequence,
            planned_quantity: createdWo.planned_quantity,
            actual_quantity:  0,
            status:           'Pending',
          }, { transaction: t });
        }

        // BOM Explosion — filter via kolom ENUM langsung (doc_status, activation_status)
        const bom = await SBoms.findOne({
          where: {
            parent_part_id:    poProd.part_id,
            doc_status:        'Approved',
            activation_status: 'Active',
            deleted_at:        null,
          },
          include: [{
            model:    SBomDetails,
            as:       'details',
            required: false,
            include:  [{ model: db.SUom, as: 'uom', attributes: ['code'] }],
          }],
          transaction: t,
        });

        if (!bom) {
          console.warn(
            `[Release] Tidak ada BOM Approved+Active untuk part_id=${poProd.part_id}. ` +
            `WO ${woNumber} dibuat tanpa material explosion.`
          );
        } else if (!bom.details?.length) {
          console.warn(
            `[Release] BOM id=${bom.id} untuk part_id=${poProd.part_id} tidak memiliki detail komponen.`
          );
        } else {
          const woMaterials = bom.details.map((detail) => ({
            wo_id:            createdWo.id,
            material_part_id: detail.part_id,
            planned_quantity: parseFloat(detail.qty_required)
                            * parseFloat(createdWo.planned_quantity)
                            * (1 + (parseFloat(detail.scrap_percentage ?? 0) / 100)),
            actual_quantity:  0,
            uom:              detail.uom?.code ?? 'PCS',
          }));
          await SWorkOrderMaterial.bulkCreate(woMaterials, { transaction: t });
        }
      }

      await po.update({
        status:      'Released',
        released_by: req.user?.id ?? null,
        released_at: new Date(),
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   'production_order',
        activityCode: 'RELEASE',
        resourceId:   po.id,
        description:  `Released Production Order ${po.po_number} — ` +
                      `generated ${schedules.length} Work Order(s) with Station & BOM explosion`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: `Production Order released. ${schedules.length} Work Order(s) generated.`,
        data:    { id: po.id, po_number: po.po_number, work_orders_created: schedules.length },
      });

    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][release]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async reschedule(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        new_start_date:    Joi.date().iso().required(),
        new_end_date:      Joi.date().iso().required(),
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
      if (po.status !== 'Released') {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'Only Released Production Orders can be rescheduled',
        });
      }

      const { new_start_date, new_end_date, reschedule_reason } = validation.value;
      const newStart = new Date(new_start_date);
      const newEnd   = new Date(new_end_date);
      const latestDO = po.latest_delivery_date ? new Date(po.latest_delivery_date) : null;

      if (newEnd <= newStart) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  'new_end_date must be after new_start_date',
        });
      }
      if (latestDO && newEnd > latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error:  `new_end_date must not exceed the latest delivery date (${po.latest_delivery_date})`,
        });
      }

      const impactedWos = await SWorkOrder.findAll({
        where:       { po_id: id, deleted_at: null },
        attributes:  ['id', 'sequence'],
        transaction: t,
      });
      const impactedWoCount = impactedWos.length;
      const stageWoCounts   = {};
      for (const wo of impactedWos) {
        const s = wo.sequence ?? 1;
        stageWoCounts[s] = (stageWoCounts[s] ?? 0) + 1;
      }

      await SProductionOrderRescheduleLog.create({
        po_id:             po.id,
        old_start_date:    po.production_start_date,
        old_end_date:      po.production_end_date,
        new_start_date:    newStart.toISOString().split('T')[0],
        new_end_date:      newEnd.toISOString().split('T')[0],
        reschedule_reason,
        impacted_wo_count: impactedWoCount,
        rescheduled_by:    req.user?.id ?? null,
        rescheduled_at:    new Date(),
      }, { transaction: t });

      if (impactedWoCount > 0) {
        const woIds = impactedWos.map((w) => w.id);

        // Hapus child records WO
        const existingStations = await SWorkOrderStation.findAll({
          where:       { wo_id: woIds },
          attributes:  ['id'],
          transaction: t,
        });
        if (existingStations.length > 0) {
          await SWorkOrderStation.destroy({ where: { wo_id: woIds }, transaction: t });
        }
        await SWorkOrderMaterial.destroy({ where: { wo_id: woIds }, transaction: t });
        await SWorkOrder.destroy({ where: { id: woIds }, transaction: t });
      }

      await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
      await SProductionOrderProduct.update({ scheduled_qty: 0 }, { where: { po_id: id }, transaction: t });

      await po.update({
        production_start_date: newStart.toISOString().split('T')[0],
        production_end_date:   newEnd.toISOString().split('T')[0],
        status:                'Approved',
        released_by:           null,
        released_at:           null,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode:   'production_order',
        activityCode: 'RESCHEDULE',
        resourceId:   po.id,
        newData:      { new_start_date, new_end_date, stage_wo_counts: stageWoCounts },
        description:  `Rescheduled Production Order ${po.po_number}: ` +
                      `${impactedWoCount} Work Order(s) cancelled`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: `Reschedule recorded. ${impactedWoCount} Work Order(s) cancelled. ` +
                 `Please regenerate the schedule and re-release.`,
        data: {
          id:                po.id,
          po_number:         po.po_number,
          impacted_wo_count: impactedWoCount,
          impacted_by_stage: stageWoCounts,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][reschedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  async _getPoEditable(id, transaction) {
    const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction });
    if (!po)                   return { ok: false, code: 404, error: 'Production Order not found' };
    if (po.status !== 'Draft') return { ok: false, code: 400, error: 'Only Draft Production Orders can be modified' };
    return { ok: true, data: po };
  }
}

export default new OrderScheduleModule();