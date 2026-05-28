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
  SProductionPlanDetailLine,
  SProductionPlanCapacityResult,
  SProductionPlanCapacityParam,
  SProductionPlanAdjustment,
  SWorkOrder,
  SWorkOrderStation,
  SWorkOrderStationJob,
  SWorkOrderMaterial,
  SBoms,
  SBomDetails,
  SCustomers,
  SParts,
  SLines,
  SLineCapacityParam,
  SFactories,
  SShifts,
  SShiftCalendars,
  SStations,
  SStationJobs,
  SJobs,
  SUsers,
  sequelize,
} = db;

// ─── Includes ─────────────────────────────────────────────────────────────────

const PO_HEADER_INCLUDE = [
  { model: SProductionPlan, as: 'plan', attributes: ['id', 'plan_number', 'plan_description'] },
  { model: SUsers, as: 'creator',  attributes: ['id', 'email'] },
  { model: SUsers, as: 'releaser', attributes: ['id', 'email'] },
  { model: SUsers, as: 'rejector', attributes: ['id', 'email'] },
];

const PO_PRODUCT_INCLUDE = [
  { model: SCustomers, as: 'customer', attributes: ['id', 'customer_code', 'name'] },
  { model: SParts,     as: 'part',     attributes: ['id', 'part_number', 'part_name'] },
  { model: SLines,     as: 'line',     attributes: ['id', 'line_code', 'name'] },
];

// ─── Number Generators ────────────────────────────────────────────────────────

async function generatePoNumber(t) {
  const now    = new Date();
  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `PO-${year}-${month}`;

  const last = await SProductionOrder.findOne({
    where:    { po_number: { [Op.iLike]: `${prefix}%` } },
    order:    [['po_number', 'DESC']],
    paranoid: false,
    lock:     t.LOCK?.UPDATE,
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
    where:    { wo_number: { [Op.iLike]: `${prefix}%` } },
    order:    [['wo_number', 'DESC']],
    paranoid: false,
    lock:     t.LOCK?.UPDATE,
    transaction: t,
  });

  let seq = 1;
  if (last) {
    const n = parseInt(last.wo_number.slice(-5), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

// ─── Calendar & Shift Helpers ─────────────────────────────────────────────────

async function getWorkingDays(lineId, startDate, endDate, transaction) {
  const calendars = await SShiftCalendars.findAll({
    where: {
      line_id:    lineId,
      active:     true,
      start_date: { [Op.lte]: endDate },
      end_date:   { [Op.gte]: startDate },
      deleted_at: null,
    },
    include: [{
      model: SShifts,
      as:    'shift',
      where: { type: 'REGULAR', category: 'PRODUCTIVE', active: true, deleted_at: null },
      required: true,
    }],
    transaction,
  });

  const dates = new Set();
  const start = new Date(startDate);
  const end   = new Date(endDate);

  for (const cal of calendars) {
    const calStart = new Date(cal.start_date);
    const calEnd   = new Date(cal.end_date);
    const from     = calStart < start ? start : calStart;
    const to       = calEnd   > end   ? end   : calEnd;

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      dates.add(d.toISOString().split('T')[0]);
    }
  }

  return Array.from(dates).sort();
}

async function getWorkingDaysWithAdjustment(lineId, startDate, endDate, adjustedWorkingDays, transaction) {
  // Ambil hari kerja dari kalender terlebih dahulu
  const calendarDays = await getWorkingDays(lineId, startDate, endDate, transaction);

  if (!adjustedWorkingDays || calendarDays.length >= adjustedWorkingDays) {
    return calendarDays;
  }

  const extraNeeded = adjustedWorkingDays - calendarDays.length;
  const calendarSet = new Set(calendarDays);
  const extraDays   = [];

  // ── Iterasi MUNDUR dari endDate ke startDate ──────────────────────────────
  // Ambil hari non-working dari akhir rentang, bukan dari awal
  const cursor = new Date(endDate);
  const startDt = new Date(startDate);

  while (extraDays.length < extraNeeded && cursor >= startDt) {
    const dateStr = cursor.toISOString().split('T')[0];
    if (!calendarSet.has(dateStr)) {
      extraDays.push(dateStr); // Sabtu/Minggu/libur dari akhir periode
    }
    cursor.setDate(cursor.getDate() - 1); // mundur satu hari
  }

  // Gabungkan kalender normal + hari tambahan, lalu sort ASC
  return [...calendarDays, ...extraDays].sort();
}

async function getLineShifts(lineId, transaction) {
  const calendars = await SShiftCalendars.findAll({
    where: { line_id: lineId, active: true, deleted_at: null },
    include: [{
      model: SShifts,
      as:    'shift',
      // Ambil SEMUA segment (PRODUCTIVE + BREAK) untuk hitung jam produktif
      where: { type: 'REGULAR', active: true, deleted_at: null },
      required: true,
    }],
    transaction,
  });

  if (!calendars.length) {
    throw new Error(
      `No shift calendar configured for line ID ${lineId}. ` +
      `Please set up an active REGULAR shift calendar before generating schedule.`
    );
  }

  // Kumpulkan semua shift rows dari semua calendar — deduplicate by shift.id
  // agar 1 shift_number yang muncul di beberapa calendar tidak dihitung dua kali
  const seenShiftIds = new Set();
  const allShifts    = [];
  for (const cal of calendars) {
    if (cal.shift && !seenShiftIds.has(cal.shift.id)) {
      seenShiftIds.add(cal.shift.id);
      allShifts.push(cal.shift);
    }
  }

  // Group by shift_number — setiap shift_number = 1 shift kerja (entitas penuh)
  // 1 shift bisa terdiri dari beberapa segment (PRODUCTIVE + BREAK)
  const shiftGroupMap = new Map(); // shift_number → { representative, productiveMinutes, segmentIds }

  for (const shift of allShifts) {
    const num = shift.shift_number;
    if (!shiftGroupMap.has(num)) {
      shiftGroupMap.set(num, {
        representative:    null,   // segment PRODUCTIVE pertama (id terkecil)
        productiveMinutes: 0,      // total menit PRODUCTIVE saja (BREAK diabaikan)
        segmentIds:        [],     // semua segment id (PRODUCTIVE + BREAK)
      });
    }

    const group = shiftGroupMap.get(num);
    group.segmentIds.push(shift.id);

    if (shift.category === 'PRODUCTIVE') {
      // Akumulasi menit produktif — segment BREAK tidak dihitung
      const minutes = calcShiftMinutes(shift.start_time, shift.end_time);
      group.productiveMinutes += minutes;

      // Representative = segment PRODUCTIVE dengan id terkecil
      if (!group.representative || shift.id < group.representative.id) {
        group.representative = shift;
      }
    }
  }

  if (shiftGroupMap.size === 0) {
    throw new Error(
      `No REGULAR shifts found for line ID ${lineId}.`
    );
  }

  // Return array shift yang sudah digabung, urut by shift_number
  return [...shiftGroupMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([shiftNumber, group]) => ({
      ...group.representative.dataValues,
      // Override dengan info gabungan
      shift_number:       shiftNumber,
      productive_minutes: group.productiveMinutes,
      segment_ids:        group.segmentIds,
      // Nama shift dari representative (misal "Shift 1", "Shift 2", "Shift 3")
      name: group.representative.name,
    }));
}

// ── Helper: hitung menit antara dua waktu (handle overnight) ─────────────────
function calcShiftMinutes(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);

  let startMin = sh * 60 + sm;
  let endMin   = eh * 60 + em;

  // Handle overnight (misal 23:00 → 02:30)
  if (endMin <= startMin) endMin += 24 * 60;

  return endMin - startMin;
}

// ─── Routing Helpers ──────────────────────────────────────────────────────────

async function getDetailLinesByDetailIds(detailIds, transaction) {
  if (!detailIds.length) return new Map();

  const rows = await SProductionPlanDetailLine.findAll({
    where:      { plan_detail_id: detailIds, deleted_at: null },
    attributes: ['plan_detail_id', 'line_id', 'sequence'],
    order:      [['sequence', 'ASC']],
    transaction,
  });

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.plan_detail_id)) map.set(row.plan_detail_id, []);
    map.get(row.plan_detail_id).push({ line_id: row.line_id, sequence: row.sequence });
  }
  return map;
}

async function resolveCapacityPerDay(planId, lineIds, transaction) {
  const capacityResults = await SProductionPlanCapacityResult.findAll({
    where: { plan_id: planId, line_id: lineIds },
    transaction,
  });
  const resultByLine = new Map(capacityResults.map((r) => [r.line_id, r]));

  const planParams = await SProductionPlanCapacityParam.findAll({
    where: { plan_id: planId, line_id: lineIds, param_type: 'BASE' },
    transaction,
  });
  const planParamByLine = new Map(planParams.map((p) => [p.line_id, p]));

  const adjustments = await SProductionPlanAdjustment.findAll({
    where:    { plan_id: planId, line_id: lineIds, deleted_at: null },
    order:    [['sequence', 'ASC']],
    transaction,
  });
  const adjByLine = new Map();
  for (const adj of adjustments) {
    if (!adjByLine.has(adj.line_id)) adjByLine.set(adj.line_id, []);
    adjByLine.get(adj.line_id).push(adj);
  }

  const fieldMap = {
    WORKING_DAYS:   'working_days',
    SHIFTS_PER_DAY: 'shifts_per_day',
    WORKING_HOURS:  'working_hours_per_shift',
    MANPOWER:       'manpower',
    EFFICIENCY:     'efficiency_factor',
    OVERTIME:       'overtime_hours',
  };

  const map = new Map();
  for (const lineId of lineIds) {
    const result = resultByLine.get(lineId);
    const base   = planParamByLine.get(lineId);

    if (!base) { map.set(lineId, 0); continue; }

    // ── OPSI A: Pakai total_capacity_units dari result, distribusi per hari ──
    // Ini konsisten dengan plan calculation karena floor hanya sekali di akhir.
    if (result?.total_capacity_units && result.total_capacity_units > 0) {
      const effective = { working_days: base.working_days };
      for (const adj of (adjByLine.get(lineId) ?? [])) {
        if (adj.adjustment_type === 'WORKING_DAYS') {
          effective.working_days = Number(adj.adjusted_value);
        }
      }
      // Distribusi merata: sisa unit dialokasikan ke hari-hari terakhir
      // capPerDay di sini adalah rata-rata — scheduler akan pakai Map<date, cap>
      // yang lebih presisi (lihat resolveCapacityPerDayMap di bawah)
      map.set(lineId, {
        capPerDay:      Math.floor(result.total_capacity_units / effective.working_days),
        totalCapUnits:  result.total_capacity_units,
      });
      continue;
    }

    // ── OPSI B: Fallback kalkulasi manual jika result belum ada ──
    const effective = {
      working_days:            base.working_days,
      shifts_per_day:          base.shifts_per_day,
      working_hours_per_shift: parseFloat(base.working_hours_per_shift),
      efficiency_factor:       parseFloat(base.efficiency_factor),
      overtime_hours:          parseFloat(base.overtime_hours ?? 0),
    };
    for (const adj of (adjByLine.get(lineId) ?? [])) {
      const field = fieldMap[adj.adjustment_type];
      if (field) effective[field] = Number(adj.adjusted_value);
    }

    const maxTaktSec        = result?.max_takt_time ?? base.max_takt_time;
    const maxTaktMin        = maxTaktSec / 60;
    const regularMinPerDay  = effective.shifts_per_day * effective.working_hours_per_shift * 60;
    const overtimeMinPerDay = effective.overtime_hours * 60;
    const totalMinPerDay    = (regularMinPerDay + overtimeMinPerDay) * effective.efficiency_factor;
    const capPerDay         = maxTaktMin > 0 ? Math.floor(totalMinPerDay / maxTaktMin) : 0;
    map.set(lineId, capPerDay);
  }

  return map;
}

// ── Hitung kapasitas per shift berdasarkan jam produktif aktual ───────────────
// Dipanggil setelah getLineShifts, untuk override capPerShift jika perlu
function calcCapacityFromShifts(groupedShifts, maxTaktTimeSec, efficiencyFactor = 1.0) {
  // groupedShifts = hasil getLineShifts (sudah group by shift_number)
  // maxTaktTimeSec = dari plan capacity result/param (dalam detik)
  // Contoh: maxTaktTime = 180 detik = 3 menit per unit

  if (!maxTaktTimeSec || maxTaktTimeSec <= 0) return null;

  const maxTaktMin = maxTaktTimeSec / 60;

  return groupedShifts.map(shift => {
    const productiveMin = shift.productive_minutes ?? 0;
    const effectiveMin  = productiveMin * efficiencyFactor;
    const capPerShift   = effectiveMin > 0
      ? Math.floor(effectiveMin / maxTaktMin)
      : 0;
    return {
      ...shift,
      cap_per_shift: capPerShift,
    };
  });
}

async function resolveShiftCalendar(lineId, shiftId, productionDate, transaction) {
  // shiftId sekarang adalah id segment representative
  // Cari calendar yang punya shift dengan shift_number yang sama

  // Ambil shift_number dari shiftId
  const shiftRecord = await SShifts.findOne({
    where: { id: shiftId },
    transaction,
  });
  const shiftNumber = shiftRecord?.shift_number ?? null;

  if (shiftNumber) {
    // Cari calendar dengan shift yang punya shift_number sama
    const byNumber = await SShiftCalendars.findOne({
      where: {
        line_id:    lineId,
        start_date: { [Op.lte]: productionDate },
        end_date:   { [Op.gte]: productionDate },
        active:     true,
        deleted_at: null,
      },
      include: [{
        model: SShifts,
        as:    'shift',
        where: { shift_number: shiftNumber, category: 'PRODUCTIVE' },
        required: true,
      }],
      transaction,
    });
    if (byNumber) return { cal: byNumber, isExact: true };
  }

  // Fallback: exact match by shift_id (lama)
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

  // Fallback nearest
  const nearest = await SShiftCalendars.findOne({
    where: {
      line_id:    lineId,
      shift_id:   shiftId,
      start_date: { [Op.lte]: productionDate },
      active:     true,
      deleted_at: null,
    },
    order:       [['end_date', 'DESC']],
    transaction,
  });
  if (nearest) return { cal: nearest, isExact: false };

  // Fallback any
  const any = await SShiftCalendars.findOne({
    where: {
      line_id:    lineId,
      start_date: { [Op.lte]: productionDate },
      active:     true,
      deleted_at: null,
    },
    order:       [['end_date', 'DESC']],
    transaction,
  });
  if (any) return { cal: any, isExact: false };

  return { cal: null, isExact: false };
}

// Tambahkan fungsi ini — menggantikan penggunaan capPerDay yang flat
function buildDailyCapMap(totalCapUnits, workingDays) {
  // Distribusi: base per hari + sisa unit ke hari-hari pertama
  const base  = Math.floor(totalCapUnits / workingDays.length);
  const extra = totalCapUnits % workingDays.length; // sisa unit

  const dailyMap = new Map();
  workingDays.forEach((date, idx) => {
    dailyMap.set(date, base + (idx < extra ? 1 : 0));
  });
  return dailyMap; // Map<date, capForThatDay>
}

// ─── Overlapping / Transfer-Batch Scheduler ───────────────────────────────────
//
// KONSEP: "Cumulative Yield Availability"
//   - Stage paralel (sequence sama) → mulai bersamaan sejak hari pertama
//   - Lini hilir (sequence lebih besar) dapat mulai setelah akumulasi output
//     lini hulu pada hari ke-T sudah mencukupi 1 unit (T atau T+1).
//   - Hilir TIDAK perlu menunggu seluruh batch hulu selesai.
//   - Kapasitas per hari per lini dibagi bersama oleh semua plan_detail
//     yang melewati lini tersebut (shared bottleneck model).
//
// CATATAN slotKey:
//   slotKey = `${date}_${shift.shift_number}` (bukan shift.id)
//   Karena 1 shift fisik direpresentasikan oleh 1 grouped object yang memiliki
//   shift_number unik per line. Menggunakan shift.id (id segment representative)
//   sudah cukup unik, tetapi shift_number lebih ekspresif dan konsisten di seluruh
//   codebase.
//
// Return: { scheduleRows, errors, stageCompletionDate }
// ─────────────────────────────────────────────────────────────────────────────
function buildOverlappingSchedule({
  products,
  capacityPerDayByLine,
  totalCapUnitsByLine,
  workingDaysByLine,
  shiftsByLine,
  lineByIdMap,
  po_id,
}) {
  const scheduleRows = [];
  const errors       = [];
  let   globalSeq    = 0;

  // (distribusi totalCapUnits ke hari lalu ke shift, tidak berubah)
  const dayRemainingCap = new Map();
  for (const [lineId, days] of workingDaysByLine.entries()) {
    const dayMap        = new Map();
    const shifts        = shiftsByLine.get(lineId) ?? [];
    const totalCapUnits = totalCapUnitsByLine.get(lineId) ?? 0;

    const basePerDay = Math.floor(totalCapUnits / days.length);
    const extraDays  = totalCapUnits % days.length;

    // Distribusi plan qty harian ke tiap shift secara merata.
    // slotKey = `${date}_${shift.shift_number}` — konsisten dengan grouped shift.
    // Sisa pembagian (remainder) didistribusikan 1-per-shift secara bergantian
    // (rotasi antar hari agar tidak selalu shift pertama yang dapat lebih).
    days.forEach((date, dayIdx) => {
      const capThisDay   = basePerDay + (dayIdx < extraDays ? 1 : 0);
      const basePerShift = shifts.length > 0 ? Math.floor(capThisDay / shifts.length) : capThisDay;
      const extraShifts  = shifts.length > 0 ? capThisDay % shifts.length : 0;
    
      shifts.forEach((shift, shiftIdx) => {
        // Rotasi: shift mana yang dapat +1 bergilir setiap hari
        // (dayIdx % shifts.length) menggeser "giliran" hari per hari
        const rotatedIdx = (shiftIdx - (dayIdx % shifts.length) + shifts.length) % shifts.length;
        const slotCap    = basePerShift + (rotatedIdx < extraShifts ? 1 : 0);
        // KEY: gunakan shift_number (bukan shift.id) — 1 grouped shift = 1 slot unik per hari
        dayMap.set(`${date}_${shift.shift_number}`, slotCap);
      });
    });
    dayRemainingCap.set(lineId, dayMap);
  }

  // ── PRE-COMPUTE leveled target per product per slot ───────────────────
  const leveledTargetMap = buildLeveledTargetMap(
    products, workingDaysByLine, shiftsByLine, totalCapUnitsByLine
  );

  const allSequences    = [...new Set(products.map((p) => p.sequence ?? 1))].sort((a, b) => a - b);
  const cumulativeYield = new Map();
  const stageCompletionDate = new Map();

  // ── LOOP UTAMA — tidak ada redistribute di sini ──────────────────────────
  for (const stage of allSequences) {
    const stageProducts = products
      .filter((p) => (p.sequence ?? 1) === stage)
      .sort((a, b) => new Date(a.delivery_date) - new Date(b.delivery_date));

    if (!stageProducts.length) continue;

    for (const product of stageProducts) {
      const lineId      = product.line_id;
      const workingDays = workingDaysByLine.get(lineId);
      const shifts      = shiftsByLine.get(lineId);
      const lineObj     = lineByIdMap.get(lineId);
      const dayMap      = dayRemainingCap.get(lineId);

      if (!workingDays || !shifts || !dayMap) {
        errors.push(`Line ID ${lineId} missing calendar/shift config for stage ${stage}.`);
        continue;
      }

      // ── MATERIAL READINESS ───────────────────────────────────────────────
      let earliestStartDate = null;

      if (stage > allSequences[0]) {
        const stageIdx      = allSequences.indexOf(stage);
        const prevStage     = allSequences[stageIdx - 1];
        const prevStageProducts = products.filter(
          (p) => (p.sequence ?? 1) === prevStage && p.plan_detail_id === product.plan_detail_id
        );

        if (prevStageProducts.length > 0) {
          let firstYieldDate = null;
          for (const upstream of prevStageProducts) {
            const yieldMap = cumulativeYield.get(`${product.plan_detail_id}_${upstream.line_id}`);
            if (!yieldMap) continue;
            for (const [date, qty] of yieldMap.entries()) {
              if (qty >= 1) {
                if (!firstYieldDate || date < firstYieldDate) firstYieldDate = date;
                break;
              }
            }
          }

          if (!firstYieldDate) {
            earliestStartDate = workingDays[0] ?? null;
          } else {
            earliestStartDate = firstYieldDate;
            if (!workingDays.includes(earliestStartDate)) {
              earliestStartDate = workingDays.find((d) => d >= firstYieldDate) ?? null;
            }
          }

          if (!earliestStartDate) {
            errors.push(
              `No available working day for line ${lineId} (stage ${stage}, part_id=${product.part_id}) ` +
              `after upstream yield becomes available. Extend production_end_date.`
            );
            continue;
          }
        }
      }

      // ── SCHEDULE ALLOCATION ──────────────────────────────────────────
      const productTargets = leveledTargetMap.get(product.id) ?? new Map();
      let remainingQty     = product.planned_qty;
      let lastScheduleDate = null;

      const myYieldKey = `${product.plan_detail_id}_${lineId}`;
      if (!cumulativeYield.has(myYieldKey)) cumulativeYield.set(myYieldKey, new Map());
      const myYieldMap = cumulativeYield.get(myYieldKey);
      let   cumQty     = 0;

      for (const productionDate of workingDays) {
        if (remainingQty <= 0) break;
        if (earliestStartDate && productionDate < earliestStartDate) {
          myYieldMap.set(productionDate, cumQty);
          continue;
        }

        for (const shift of shifts) {
          if (remainingQty <= 0) break;

          // slotKey harus konsisten: gunakan shift_number (bukan shift.id)
          // dayRemainingCap dan leveledTargetMap keduanya dibangun dengan key ini
          const slotKey      = `${productionDate}_${shift.shift_number}`;
          const remainingCap = dayMap.get(slotKey) ?? 0;
          if (remainingCap <= 0) continue;

          const targetQty  = productTargets.get(slotKey) ?? 0;
          if (targetQty <= 0) continue;

          const plannedQty = Math.min(targetQty, remainingCap, remainingQty);
          if (plannedQty <= 0) continue;

          scheduleRows.push({
            po_id,
            po_product_id:         product.id,
            row_sequence:          globalSeq++,
            production_date:       productionDate,
            line_id:               lineId,
            shift_id:              shift.id,   // FK ke DB tetap pakai id representative
            part_id:               product.part_id,
            sequence:              stage,
            planned_qty_per_day:   plannedQty,
            actual_qty_per_day:    0,
            line_capacity_per_day: remainingCap,
            utilization_pct:       remainingCap > 0
              ? Math.round((plannedQty / remainingCap) * 10000) / 100
              : 0,
            status:              'Scheduled',
            line_name_snapshot:  lineObj?.name ?? null,
            shift_name_snapshot: shift.name    ?? null,
          });

          dayMap.set(slotKey, remainingCap - plannedQty);
          remainingQty    -= plannedQty;
          cumQty          += plannedQty;
          lastScheduleDate = productionDate;
        }

        myYieldMap.set(productionDate, cumQty);
      }

      // Jika masih ada sisa — jangan error dulu, biarkan redistribute handle
      if (remainingQty > 0) {
        product._partiallyScheduled = true;
        product._unscheduledQty     = remainingQty;
        // _fullyScheduled tetap false → akan masuk redistribute loop
      } else {
        product._fullyScheduled = true;
      }

      if (lastScheduleDate) {
        if (!stageCompletionDate.has(product.plan_detail_id)) {
          stageCompletionDate.set(product.plan_detail_id, new Map());
        }
        const detailStageMap     = stageCompletionDate.get(product.plan_detail_id);
        const existingCompletion = detailStageMap.get(stage);
        if (!existingCompletion || lastScheduleDate > existingCompletion) {
          detailStageMap.set(stage, lastScheduleDate);
        }
      }
    }
  }
  // ── AKHIR LOOP UTAMA ─────────────────────────────────────────────────────

  // ── REDISTRIBUTE LOOP ────────────────────────────────────────────────────
  const unfinished = products.filter((p) => !p._fullyScheduled);

  for (const product of unfinished) {
    const lineId   = product.line_id;
    const dayMap   = dayRemainingCap.get(lineId);
    const shifts   = shiftsByLine.get(lineId) ?? [];
    const lineObj  = lineByIdMap.get(lineId);
    const workDays = workingDaysByLine.get(lineId) ?? [];
    const myStage  = product.sequence ?? 1;

    const alreadyScheduled = scheduleRows
      .filter((r) => r.po_product_id === product.id)
      .reduce((s, r) => s + r.planned_qty_per_day, 0);
    let remaining = product.planned_qty - alreadyScheduled;

    if (remaining <= 0) {
      product._fullyScheduled = true;
      continue;
    }

    // ── Tentukan earliestStartDate ───────────────────────────────────────
    let redistributeEarliestDate = null;
    if (myStage > allSequences[0]) {
      const stageIdx  = allSequences.indexOf(myStage);
      const prevStage = allSequences[stageIdx - 1];
      const prevCompletion = stageCompletionDate.get(product.plan_detail_id)?.get(prevStage);
      if (prevCompletion) {
        redistributeEarliestDate = workDays.includes(prevCompletion)
          ? prevCompletion
          : workDays.find((d) => d >= prevCompletion) ?? null;
      } else {
        redistributeEarliestDate = workDays[0] ?? null;
      }
    }

    // ── Helper: coba alokasi dengan date filter tertentu ─────────────────
    const tryAllocate = (dateFilter) => {
      for (const date of workDays) {
        if (remaining <= 0) break;
        if (dateFilter && date < dateFilter) continue;

        for (const shift of shifts) {
          if (remaining <= 0) break;
          // Konsisten: slotKey pakai shift_number (bukan shift.id)
          const slotKey      = `${date}_${shift.shift_number}`;
          const remainingCap = dayMap.get(slotKey) ?? 0;
          if (remainingCap <= 0) continue;

          const qty = Math.min(remaining, remainingCap);
          scheduleRows.push({
            po_id,
            po_product_id:         product.id,
            row_sequence:          globalSeq++,
            production_date:       date,
            line_id:               lineId,
            shift_id:              shift.id,   // FK ke DB tetap pakai id
            part_id:               product.part_id,
            sequence:              myStage,
            planned_qty_per_day:   qty,
            actual_qty_per_day:    0,
            line_capacity_per_day: remainingCap,
            utilization_pct:       remainingCap > 0
              ? Math.round((qty / remainingCap) * 10000) / 100
              : 0,
            status:              'Scheduled',
            line_name_snapshot:  lineObj?.name ?? null,
            shift_name_snapshot: shift.name    ?? null,
          });

          dayMap.set(slotKey, remainingCap - qty);
          remaining -= qty;

          // Update stageCompletionDate
          if (!stageCompletionDate.has(product.plan_detail_id)) {
            stageCompletionDate.set(product.plan_detail_id, new Map());
          }
          const detailStageMap     = stageCompletionDate.get(product.plan_detail_id);
          const existingCompletion = detailStageMap.get(myStage);
          if (!existingCompletion || date > existingCompletion) {
            detailStageMap.set(myStage, date);
          }
        }
      }
    };

    // ── Coba dengan constraint dulu ───────────────────────────────────────
    tryAllocate(redistributeEarliestDate);

    // ── Jika masih kurang, fallback tanpa constraint (ambil slot manapun) ─
    if (remaining > 0 && redistributeEarliestDate) {
      console.warn(
        `[Redistribute Fallback] Line ${lineId} stage ${myStage} part_id=${product.part_id}: ` +
        `stage ordering constraint relaxed — remaining=${remaining}`
      );
      tryAllocate(null); // tanpa filter tanggal
    }

    if (remaining > 0) {
      errors.push(
        `Insufficient capacity on line ${lineId} for part_id=${product.part_id} ` +
        `at stage ${myStage}. Unscheduled qty: ${remaining}. ` +
        `Extend production_end_date or review line capacity.`
      );
    } else {
      product._fullyScheduled = true;
    }
  }
  // ── AKHIR REDISTRIBUTE ───────────────────────────────────────────────────

  return { scheduleRows, errors, stageCompletionDate };
}

// ─── Round-Robin Daily Scheduler ─────────────────────────────────────────────
//
// Setiap hari dialokasikan penuh ke SATU produk secara bergiliran.
// Jika kapasitas hari itu lebih besar dari sisa qty produk aktif,
// sisa kapasitas digilirkan ke produk berikutnya di hari yang sama.
//
// Hasil: qty per baris = capPerShift (besar), jumlah baris sedikit,
//        distribusi shift merata via rotasi.
// ─────────────────────────────────────────────────────────────────────────────
function buildLeveledTargetMap(products, workingDaysByLine, shiftsByLine, totalCapUnitsByLine) {
  const targetMap = new Map();
  for (const p of products) targetMap.set(p.id, new Map());

  const productsByLine = new Map();
  for (const p of products) {
    if (!productsByLine.has(p.line_id)) productsByLine.set(p.line_id, []);
    productsByLine.get(p.line_id).push(p);
  }

  for (const [lineId, lineProducts] of productsByLine.entries()) {
    const days          = workingDaysByLine.get(lineId) ?? [];
    const shifts        = shiftsByLine.get(lineId)      ?? [];
    const totalCapUnits = totalCapUnitsByLine.get(lineId) ?? 0;

    if (totalCapUnits === 0 || days.length === 0 || shifts.length === 0) continue;

    const basePerDay = Math.floor(totalCapUnits / days.length);
    const extraDays  = totalCapUnits % days.length;

    // Sisa qty per produk
    const remainingQtyMap = new Map(lineProducts.map(p => [p.id, p.planned_qty]));

    // Baris 841 — ganti sort order
    const queue = [...lineProducts].sort(
      (a, b) => (a.sequence ?? 1) - (b.sequence ?? 1)
                || new Date(a.delivery_date) - new Date(b.delivery_date)
    );
    let queueIdx = 0; // pointer ke produk aktif saat ini

    days.forEach((date, dayIdx) => {
      const capThisDay   = basePerDay + (dayIdx < extraDays ? 1 : 0);
      const basePerShift = Math.floor(capThisDay / shifts.length);
      const extraShifts  = capThisDay % shifts.length;

      // Kapasitas per shift dengan rotasi
      // slotKey = `${date}_${shift.shift_number}` — konsisten dengan dayRemainingCap
      const shiftCaps = shifts.map((shift, shiftIdx) => {
        const rotatedIdx = (shiftIdx - (dayIdx % shifts.length) + shifts.length) % shifts.length;
        return {
          shiftId: shift.id,
          slotKey: `${date}_${shift.shift_number}`,  // ← shift_number, bukan shift.id
          cap:     basePerShift + (rotatedIdx < extraShifts ? 1 : 0),
        };
      });

      // Sisa kapasitas hari ini yang belum dialokasikan
      let capLeft = capThisDay;

      // Isi produk satu per satu sampai kapasitas hari habis
      let safetyBreak = 0;
      while (capLeft > 0 && safetyBreak < lineProducts.length * 2) {
        safetyBreak++;

        // Cari produk berikutnya yang masih punya sisa qty
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
        if (!foundActive) break; // semua produk sudah selesai

        const activeProduct = queue[queueIdx];
        const rem           = remainingQtyMap.get(activeProduct.id) ?? 0;

        // Alokasi hari ini untuk produk aktif: ambil min(rem, capLeft)
        const allocToday = Math.min(rem, capLeft);

        // Distribusi allocToday ke shift (Largest Remainder)
        // proporsional terhadap kapasitas shift
        const shiftTargets = shiftCaps.map(sc => {
          const exact     = capThisDay > 0 ? (allocToday * sc.cap) / capThisDay : 0;
          const floor     = Math.floor(exact);
          const remainder = exact - floor;
          return { ...sc, floor, remainder };
        });

        const floorTotal = shiftTargets.reduce((s, st) => s + st.floor, 0);
        let   extra      = allocToday - floorTotal;

        const sortedShifts = [...shiftTargets]
          .sort((a, b) => b.remainder - a.remainder || a.slotKey.localeCompare(b.slotKey));

        const winners = new Set(
          sortedShifts.slice(0, extra).map(st => st.slotKey)
        );

        const productTargetMap = targetMap.get(activeProduct.id);
        let   actualAlloc      = 0;

        for (const st of shiftTargets) {
          const qty = st.floor + (winners.has(st.slotKey) ? 1 : 0);
          if (qty > 0) {
            // Merge dengan target yang sudah ada di slot ini
            // (jika produk sama dapat jatah di hari yang sama dari giliran berbeda)
            const existing = productTargetMap.get(st.slotKey) ?? 0;
            productTargetMap.set(st.slotKey, existing + qty);
            actualAlloc += qty;
          }
        }

        // Update sisa qty dan kapasitas hari
        remainingQtyMap.set(activeProduct.id, rem - actualAlloc);
        capLeft -= actualAlloc;

        // Maju ke produk berikutnya dalam antrian
        queueIdx = (queueIdx + 1) % queue.length;
      }
    });

    // Validasi akhir
    for (const p of lineProducts) {
      const totalTarget = [...(targetMap.get(p.id)?.values() ?? [])]
        .reduce((s, v) => s + v, 0);
      if (totalTarget !== p.planned_qty) {
        console.warn(
          `[buildLeveledTargetMap] Mismatch product ${p.id}: ` +
          `expected=${p.planned_qty}, got=${totalTarget}, ` +
          `diff=${p.planned_qty - totalTarget}`
        );
      }
    }
  }

  return targetMap;
}

// ─── Validate Schedule Integrity (read-only, no capacity re-calc) ─────────────
//
// Validasi yang digunakan oleh Submit: periksa bahwa setiap product row sudah
// terpenuhi qtynya dan stage ordering konsisten (overlapping diizinkan).
// TIDAK melakukan ulang kalkulasi kapasitas linear.
//
// Return: { ok: boolean, error?: string }
// ─────────────────────────────────────────────────────────────────────────────
async function validateScheduleIntegrity(po, products, transaction) {
  // 1. Validasi qty — tidak berubah
  for (const product of products) {
    const scheduledSum = await SProductionOrderSchedule.sum('planned_qty_per_day', {
      where: { po_id: po.id, po_product_id: product.id },
      transaction,
    });
    if ((scheduledSum ?? 0) !== product.planned_qty) {
      return {
        ok: false,
        error: `Scheduled qty (${scheduledSum ?? 0}) does not match planned qty (${product.planned_qty}) ` +
               `for product id=${product.id} on line_id=${product.line_id} (stage ${product.sequence}). Regenerate the schedule.`,
      };
    }
  }

  // 2. Overlapping-aware: cukup validasi bahwa stage N tidak SELESAI sebelum stage N-1 MULAI
  //    (bukan weighted avg — itu terlalu ketat untuk transfer batch)
  const schedules = await SProductionOrderSchedule.findAll({
    where:       { po_id: po.id },
    attributes:  ['po_product_id', 'sequence', 'production_date', 'planned_qty_per_day'],
    order:       [['sequence', 'ASC'], ['production_date', 'ASC']],
    transaction,
  });

  const productById = new Map(products.map((p) => [p.id, p]));

  // Map<plan_detail_id, Map<sequence, { firstDate, lastDate }>>
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

      // Validasi: stage hilir tidak boleh SELESAI sebelum stage hulu MULAI
      // (overlap diizinkan — transfer batch)
      if (curr.firstDate < prev.firstDate) {
        return {
          ok: false,
          error: `Stage ordering anomaly for plan_detail_id=${detailId}: ` +
                 `stage ${currStage} starts (${curr.firstDate}) before stage ${prevStage} starts (${prev.firstDate}). ` +
                 `Regenerate the schedule.`,
        };
      }
    }
  }

  return { ok: true };
}

// ─── Module ───────────────────────────────────────────────────────────────────

class OrderScheduleModule extends BaseModule {

  // ── List ──────────────────────────────────────────────────────────────────────

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
        limit, offset,
        include:  PO_HEADER_INCLUDE,
        order:    [['created_at', 'DESC']],
        distinct: true,
      });

      return helper.sendResponse(res, {
        status: true, code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      });
    } catch (error) {
      console.log('[OrderScheduleModule][list]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Detail ────────────────────────────────────────────────────────────────────

  async detail(req, res) {
    try {
      const { id } = req.params;
  
      // 1. Fetch header dulu (ringan, cepat)
      const po = await SProductionOrder.findOne({
        where:      { id, deleted_at: null },
        include:    PO_HEADER_INCLUDE,
      });
  
      if (!po) {
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
  
      // 2. Fetch semua relasi berat secara PARALEL
      const [products, schedules, rescheduleLogs] = await Promise.all([
  
        SProductionOrderProduct.findAll({
          where:   { po_id: id },
          include: PO_PRODUCT_INCLUDE,
        }),
  
        SProductionOrderSchedule.findAll({
          where:   { po_id: id },
          include: [
            {
              model:      SShifts,
              as:         'shift',
              attributes: ['id', 'name', 'start_time', 'end_time'],
            },
            {
              model:      SParts,
              as:         'part',
              attributes: ['id', 'part_number', 'part_name'],
            },
            {
              model:      SLines,
              as:         'line',
              attributes: ['id', 'line_code', 'name'],
            },
          ],
          order: [['sequence', 'ASC'], ['production_date', 'ASC']],
        }),
  
        SProductionOrderRescheduleLog.findAll({
          where: { po_id: id },
          order: [['rescheduled_at', 'DESC']],
          limit: 20, // ← batasi log, jarang butuh semua history
        }),
  
      ]);
  
      // 3. Gabungkan hasil
      const result = {
        ...po.toJSON(),
        products,
        schedules,
        reschedule_logs: rescheduleLogs,
      };
  
      return helper.sendResponse(res, { status: true, code: 200, data: result });
  
    } catch (error) {
      console.log('[OrderScheduleModule][detail]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Create ────────────────────────────────────────────────────────────────────

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

      const { plan_id, production_start_date, production_end_date, po_description, priority } = validation.value;

      const plan = await SProductionPlan.findOne({
        where: { id: plan_id, status: 'Approved', deleted_at: null },
        transaction: t,
      });
      if (!plan) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Production Plan not found or not Approved' });
      }

      const existingPO = await SProductionOrder.findOne({
        where: { plan_id, status: { [Op.notIn]: ['Cancelled'] }, deleted_at: null },
        transaction: t,
      });
      if (existingPO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `An active Production Order (${existingPO.po_number}) already exists for this plan. Cancel it first.`,
        });
      }

      const startDt  = new Date(production_start_date);
      const endDt    = new Date(production_end_date);
      const latestDO = plan.latest_delivery_date ? new Date(plan.latest_delivery_date) : null;

      if (endDt <= startDt) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'production_end_date must be after production_start_date' });
      }
      if (latestDO && endDt > latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `production_end_date must not exceed latest_delivery_date (${plan.latest_delivery_date})`,
        });
      }

      const po_number = await generatePoNumber(t);

      const planDetails = await SProductionPlanDetail.findAll({
        where: { plan_id, deleted_at: null },
        order: [['sequence', 'ASC']],
        transaction: t,
      });

      if (!planDetails.length) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Production Plan has no detail items' });
      }

      const detailIds     = planDetails.map((d) => d.id);
      const detailLineMap = await getDetailLinesByDetailIds(detailIds, t);

      const unroutedDetails = planDetails.filter((d) => !(detailLineMap.get(d.id) ?? []).length);
      if (unroutedDetails.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `${unroutedDetails.length} plan detail(s) have no routing configured. Ensure all parts have an active default routing set up.`,
        });
      }

      const total_products    = planDetails.length;
      const total_planned_qty = planDetails.reduce((s, d) => s + (d.qty_request || 0), 0);

      const po = await SProductionOrder.create({
        po_number,
        plan_id,
        production_start_date: startDt.toISOString().split('T')[0],
        production_end_date:   endDt.toISOString().split('T')[0],
        earliest_delivery_date: plan.earliest_delivery_date,
        latest_delivery_date:   plan.latest_delivery_date,
        priority,
        po_description,
        total_products,
        total_planned_qty,
        status:     'Draft',
        created_by: req.user?.id ?? null,
      }, { transaction: t });

      const productRows = [];
      for (const detail of planDetails) {
        const lines = detailLineMap.get(detail.id);
        for (const { line_id, sequence: routingSeq } of lines) {
          productRows.push({
            po_id:          po.id,
            plan_detail_id: detail.id,
            sequence:       routingSeq,
            customer_id:    detail.customer_id,
            part_id:        detail.part_id,
            line_id,
            delivery_date:  detail.delivery_date,
            planned_qty:    detail.qty_request,
          });
        }
      }

      await SProductionOrderProduct.bulkCreate(productRows, { transaction: t });

      const lineCount  = new Set(productRows.map((r) => r.line_id)).size;
      const stageCount = new Set(productRows.map((r) => r.sequence)).size;

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'CREATE',
        resourceId: po.id, newData: po,
        description: `Created PO ${po_number} — ${productRows.length} product-line rows across ${lineCount} line(s), ${stageCount} sequential stage(s)`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 201, message: 'Production Order created',
        data: {
          id:                po.id,
          po_number:         po.po_number,
          product_line_rows: productRows.length,
          lines_count:       lineCount,
          stage_count:       stageCount,
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][create]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────────

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
      const endDt   = production_end_date   ? new Date(production_end_date)   : new Date(po.data.production_end_date);
      const startDt = production_start_date ? new Date(production_start_date) : new Date(po.data.production_start_date);
      const latestDO = po.data.latest_delivery_date ? new Date(po.data.latest_delivery_date) : null;

      if (endDt <= startDt) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'production_end_date must be after production_start_date' });
      }
      if (latestDO && endDt > latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `production_end_date must not exceed latest_delivery_date (${po.data.latest_delivery_date})`,
        });
      }

      const datesChanged = !!(production_start_date || production_end_date);
      const oldData = po.data.toJSON();
      await po.data.update(validation.value, { transaction: t });

      if (datesChanged) {
        const existing = await SProductionOrderSchedule.count({ where: { po_id: id }, transaction: t });
        if (existing > 0) {
          await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
          await SProductionOrderProduct.update({ scheduled_qty: 0 }, { where: { po_id: id }, transaction: t });
          await po.data.update({ total_scheduled_qty: 0 }, { transaction: t });
        }
      }

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'UPDATE',
        resourceId: po.data.id, oldData, newData: po.data,
        description: `Updated Production Order ${po.data.po_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: datesChanged
          ? 'Production Order updated. Existing schedules were cleared — please regenerate the schedule.'
          : 'Production Order updated',
        data: { id: po.data.id, po_number: po.data.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][update]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

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

      await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
      await SProductionOrderProduct.destroy({ where: { po_id: id }, transaction: t });

      const oldData = po.toJSON();
      await po.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'DELETE',
        resourceId: po.id, oldData,
        description: `Deleted Production Order ${po.po_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, { status: true, code: 200, message: 'Production Order deleted' });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][delete]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Generate Schedule ─────────────────────────────────────────────────────────
  //
  // POST /production-orders/:id/generate-schedule
  //
  // Menggunakan Overlapping / Transfer-Batch Scheduler:
  //   - Stage paralel (sequence sama) → jalan bersamaan sejak hari pertama
  //   - Stage hilir dapat mulai saat akumulasi output hulu ≥ 1 unit (transfer batch)
  //   - Tidak perlu menunggu seluruh batch hulu selesai
  // ─────────────────────────────────────────────────────────────────────────────
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
        where: { po_id: id },
        order: [['sequence', 'ASC'], ['delivery_date', 'ASC']],
        transaction: t,
      });

      if (!products.length) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'No products found in this Production Order' });
      }

      const unassigned = products.filter((p) => !p.line_id);
      if (unassigned.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `${unassigned.length} product row(s) have no line assigned. Recreate the Production Order to re-resolve routing.`,
        });
      }

      const missingSeq = products.filter((p) => p.sequence == null);
      if (missingSeq.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `${missingSeq.length} product row(s) have no sequence. Recreate the Production Order.`,
        });
      }

      const lineIds = [...new Set(products.map((p) => p.line_id))];

      const capacityInfoByLine    = await resolveCapacityPerDay(po.data.plan_id, lineIds, t);
      const capacityPerDayByLine  = new Map([...capacityInfoByLine.entries()].map(([k, v]) => [k, v.capPerDay]));
      const totalCapUnitsByLine   = new Map([...capacityInfoByLine.entries()].map(([k, v]) => [k, v.totalCapUnits]));
      for (const lineId of lineIds) {
        if ((capacityPerDayByLine.get(lineId) ?? 0) === 0) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `Line ID ${lineId} has zero daily capacity. Check max_takt_time configuration for this line.`,
          });
        }
      }

      // SESUDAH — aware terhadap adjustment working_days dari plan
      // 1. Ambil plan params + adjustments untuk semua line sekaligus
      const planParams = await SProductionPlanCapacityParam.findAll({
        where: { plan_id: po.data.plan_id, line_id: lineIds, param_type: 'BASE' },
        transaction: t,
      });
      const planParamByLine = new Map(planParams.map((p) => [p.line_id, p]));

      const allAdjustments = await SProductionPlanAdjustment.findAll({
        where:    { plan_id: po.data.plan_id, line_id: lineIds, deleted_at: null },
        order:    [['sequence', 'ASC']],
        transaction: t,
      });
      const adjByLine = new Map();
      for (const adj of allAdjustments) {
        if (!adjByLine.has(adj.line_id)) adjByLine.set(adj.line_id, []);
        adjByLine.get(adj.line_id).push(adj);
      }

      // 2. Resolve effective working_days per line (base + adjustment override)
      const effectiveWorkingDaysByLine = new Map();
      for (const lineId of lineIds) {
        const base = planParamByLine.get(lineId);
        let effectiveDays = base?.working_days ?? 21; // fallback ke 21 jika tidak ada param
        for (const adj of (adjByLine.get(lineId) ?? [])) {
          if (adj.adjustment_type === 'WORKING_DAYS') {
            effectiveDays = Number(adj.adjusted_value); // last-wins, sesuai logika _calcLineCapacity
          }
        }
        effectiveWorkingDaysByLine.set(lineId, effectiveDays);
      }

      // 3. Build working days per line dengan adjustment
      const workingDaysByLine = new Map();
      for (const lineId of lineIds) {
        const adjustedCount = effectiveWorkingDaysByLine.get(lineId);
        const days = await getWorkingDaysWithAdjustment(
          lineId,
          po.data.production_start_date,
          po.data.production_end_date,
          adjustedCount,
          t,
        );
        if (!days.length) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `No active working days for line ID ${lineId} in the production date range. Check shift calendars.`,
          });
        }
        workingDaysByLine.set(lineId, days);
      }

      for (const [lineId, days] of workingDaysByLine.entries()) {
        const totalCap = totalCapUnitsByLine.get(lineId);
        console.log(`Line ${lineId}: workingDays=${days.length}, totalCapUnits=${totalCap}, days=${JSON.stringify(days)}`);
      }

      const shiftsByLine = new Map();
      for (const lineId of lineIds) {
        const shifts = await getLineShifts(lineId, t);
        if (!shifts.length) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `No REGULAR PRODUCTIVE shifts found for line ID ${lineId}.`,
          });
        }

        // Ambil max_takt_time dan efficiency dari plan
        const capResult = capacityInfoByLine.get(lineId);
        const planParam = planParamByLine.get(lineId);

        // max_takt_time dari result (sudah include adjustment), fallback ke param
        const maxTaktSec    = capResult?.max_takt_time ?? planParam?.max_takt_time ?? 0;
        const effFactor     = parseFloat(planParam?.efficiency_factor ?? 1);

        if (maxTaktSec > 0) {
          // Recalculate capPerShift dari jam produktif aktual
          const shiftsWithCap = calcCapacityFromShifts(shifts, maxTaktSec, effFactor);
          
          // Log untuk debugging
          for (const s of shiftsWithCap) {
            console.log(
              `Line ${lineId} Shift ${s.shift_number}: ` +
              `productive=${s.productive_minutes}min, ` +
              `takt=${maxTaktSec}s, ` +
              `cap=${s.cap_per_shift} units/shift`
            );
          }
          
          shiftsByLine.set(lineId, shiftsWithCap);
        } else {
          shiftsByLine.set(lineId, shifts);
        }
      }

      const lineRows = await SLines.findAll({
        where:   { id: lineIds },
        include: [{ model: SFactories, as: 'factory', attributes: ['id'] }],
        transaction: t,
      });
      const lineByIdMap = new Map(lineRows.map((l) => [l.id, l]));

      await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
      await SProductionOrderProduct.update({ scheduled_qty: 0 }, { where: { po_id: id }, transaction: t });

      // Run Overlapping / Transfer-Batch Scheduler
      const { scheduleRows, errors, stageCompletionDate } = buildOverlappingSchedule({
        products,
        capacityPerDayByLine,
        totalCapUnitsByLine,
        workingDaysByLine,
        shiftsByLine,
        lineByIdMap,
        po_id: id,
      });

      if (errors.length > 0) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: errors.join(' | '), errors });
      }

      await SProductionOrderSchedule.bulkCreate(scheduleRows, { transaction: t });

      const scheduledByProduct = new Map();
      for (const row of scheduleRows) {
        scheduledByProduct.set(
          row.po_product_id,
          (scheduledByProduct.get(row.po_product_id) ?? 0) + row.planned_qty_per_day,
        );
      }
      for (const [productId, qty] of scheduledByProduct.entries()) {
        await SProductionOrderProduct.update({ scheduled_qty: qty }, { where: { id: productId }, transaction: t });
      }

      const total_scheduled_qty = po.data.total_planned_qty;
      await po.data.update({ total_scheduled_qty }, { transaction: t });

      const stageSummary = {};
      for (const [detailId, stageMap] of stageCompletionDate.entries()) {
        stageSummary[detailId] = {};
        for (const [seq, date] of stageMap.entries()) {
          stageSummary[detailId][`stage_${seq}`] = date;
        }
      }

      const stagesUsed = [...new Set(products.map((p) => p.sequence))].sort((a, b) => a - b);

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'GENERATE_SCHEDULE',
        resourceId: po.data.id, newData: { schedule_count: scheduleRows.length },
        description: `Generated ${scheduleRows.length} overlapping schedule rows for PO ${po.data.po_number} — ${stagesUsed.length} stage(s) across ${lineIds.length} line(s)`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: `Schedule generated (overlapping model): ${scheduleRows.length} rows — ${stagesUsed.length} stage(s) across ${lineIds.length} line(s)`,
        data: {
          schedule_count:       scheduleRows.length,
          lines_used:           lineIds.length,
          sequential_stages:    stagesUsed.length,
          stage_order:          stagesUsed,
          stage_completion:     stageSummary,
          working_days_by_line: Object.fromEntries(
            [...workingDaysByLine.entries()].map(([lid, days]) => [lid, days.length])
          ),
        },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][generateSchedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Update Schedule ───────────────────────────────────────────────────────────

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
            error: `production_date must be within PO range (${po.data.production_start_date} ~ ${po.data.production_end_date})`,
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
            error: 'shift_id does not reference an active REGULAR PRODUCTIVE shift',
          });
        }
      }

      if (planned_qty_per_day !== undefined) {
        const cap = schedule.line_capacity_per_day ?? 0;
        if (cap > 0 && planned_qty_per_day > cap) {
          await t.rollback();
          return helper.sendResponse(res, {
            status: false, code: 400,
            error: `planned_qty_per_day (${planned_qty_per_day}) exceeds line capacity per day (${cap})`,
          });
        }
        validation.value.utilization_pct = cap > 0
          ? Math.round((planned_qty_per_day / cap) * 10000) / 100
          : 0;
      }

      await schedule.update(validation.value, { transaction: t });

      const schedSum = await SProductionOrderSchedule.sum('planned_qty_per_day', {
        where: { po_id: id, po_product_id: schedule.po_product_id },
        transaction: t,
      });
      await SProductionOrderProduct.update(
        { scheduled_qty: schedSum || 0 },
        { where: { id: schedule.po_product_id }, transaction: t },
      );

      const totalSched = await SProductionOrderSchedule.sum('planned_qty_per_day', {
        where: { po_id: id },
        transaction: t,
      });
      await po.data.update({ total_scheduled_qty: totalSched || 0 }, { transaction: t });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: 'Schedule updated. Note: manual edits may violate stage precedence — consider regenerating the full schedule for consistency.',
        data: schedule,
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][updateSchedule]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  //
  // POST /production-orders/:id/submit
  //
  // Validasi menggunakan validateScheduleIntegrity (overlapping-aware).
  // TIDAK menjalankan ulang kalkulasi kapasitas linear — hanya membaca
  // hasil plot yang sudah ada di SProductionOrderSchedule.
  // ─────────────────────────────────────────────────────────────────────────────
  async submit(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({
        where:   { id, deleted_at: null },
        include: [{ model: SProductionPlan, as: 'plan', attributes: ['latest_delivery_date'] }],
        transaction: t,
      });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      if (po.status !== 'Draft') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Draft Production Orders can be submitted' });
      }

      const latestDO = po.plan?.latest_delivery_date ? new Date(po.plan.latest_delivery_date) : null;
      const endDt    = new Date(po.production_end_date);
      if (latestDO && endDt > latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `production_end_date (${po.production_end_date}) must not exceed latest_delivery_date (${po.plan.latest_delivery_date})`,
        });
      }

      const scheduleCount = await SProductionOrderSchedule.count({ where: { po_id: id }, transaction: t });
      if (scheduleCount === 0) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'No schedule generated. Run Generate Schedule first.' });
      }

      const products = await SProductionOrderProduct.findAll({ where: { po_id: id }, transaction: t });

      // Validasi menggunakan overlapping-aware integrity check (bukan linear capacity re-calc)
      const integrity = await validateScheduleIntegrity(po, products, t);
      if (!integrity.ok) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: integrity.error });
      }

      const oldData = po.toJSON();
      await po.update({ status: 'Pending_Approval' }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'SUBMIT',
        resourceId: po.id, oldData, newData: po,
        description: `Submitted Production Order ${po.po_number} for approval`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Production Order submitted for approval',
        data: { id: po.id, po_number: po.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][submit]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Approve ───────────────────────────────────────────────────────────────────
  //
  // Approve hanya memverifikasi status — tidak menjalankan ulang kalkulasi.
  // Schedule sudah divalidasi pada tahap Submit.
  // ─────────────────────────────────────────────────────────────────────────────
  async approve(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({ notes: Joi.string().optional().allow('', null) });
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
        return helper.sendResponse(res, { status: false, code: 400, error: 'Production Order is not pending approval' });
      }

      const oldData = po.toJSON();
      await po.update({
        status: 'Approved',
        notes:  validation.value.notes ?? po.notes,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'APPROVE',
        resourceId: po.id, oldData, newData: po,
        description: `Approved Production Order ${po.po_number}`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Production Order approved',
        data: { id: po.id, po_number: po.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][approve]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Reject ────────────────────────────────────────────────────────────────────

  async reject(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({ notes: Joi.string().required() });
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
        return helper.sendResponse(res, { status: false, code: 400, error: 'Production Order is not pending approval' });
      }

      const oldData = po.toJSON();
      await po.update({
        status:      'Draft',
        notes:       validation.value.notes,
        rejected_by: req.user?.id ?? null,
        rejected_at: new Date(),
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'REJECT',
        resourceId: po.id, oldData, newData: po,
        description: `Rejected Production Order ${po.po_number} — returned to Draft`, transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200, message: 'Production Order rejected and returned to Draft',
        data: { id: po.id, po_number: po.po_number },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][reject]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Release ───────────────────────────────────────────────────────────────────
  //
  // POST /production-orders/:id/release
  //
  // Generate Work Orders dari schedule rows yang sudah ada.
  // FIX: field mapping yang benar (production_date, planned_qty_per_day).
  // Tidak melakukan re-validasi kapasitas — schedule sudah divalidasi saat Submit.
  // ─────────────────────────────────────────────────────────────────────────────
  async release(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction: t });
      if (!po) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 404, error: 'Production Order not found' });
      }
      // Release dari status Approved (setelah melewati Submit → Approve)
      if (po.status !== 'Approved') {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: `Cannot release PO with status '${po.status}'. PO must be Approved first.` });
      }

      const schedules = await SProductionOrderSchedule.findAll({
        where: { po_id: po.id },
        transaction: t,
      });

      if (schedules.length === 0) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'Cannot release PO without schedules. Generate schedule first.' });
      }

      const poProducts = await SProductionOrderProduct.findAll({
        where: { po_id: po.id },
        transaction: t,
      });
      const prodMap = Object.fromEntries(poProducts.map((p) => [p.id, p]));

      // Hapus draft WO sebelumnya jika ada (safe regenerate)
      await SWorkOrder.destroy({ where: { po_id: po.id, status: 'Draft' }, transaction: t });

      // Generate Work Orders per schedule row
      await Promise.all(schedules.map(async (sched) => {
        const poProd = prodMap[sched.po_product_id];
        if (!poProd) throw new Error(`Missing PO Product info for schedule id=${sched.id}`);

        const { cal: shiftCal, isExact } = await resolveShiftCalendar(
          sched.line_id,
          sched.shift_id,
          sched.production_date,
          t,
        );
        
        if (!shiftCal) {
          throw new Error(
            `No shift calendar found for Line ${sched.line_id}. ` +
            `Cannot generate Work Order for date ${sched.production_date}.`
          );
        }
        
        if (!isExact) {
          console.warn(
            `[Release] Line ${sched.line_id} date=${sched.production_date}: ` +
            `using nearest shift calendar id=${shiftCal.id} (adjustment extra day)`
          );
        }
        
        const woNumber = await generateWoNumber(sched.production_date, t);
        const createdWo = await SWorkOrder.create({
          wo_number:         woNumber,
          po_id:             po.id,
          part_id:           poProd.part_id,
          line_id:           sched.line_id,
          factory_id:        shiftCal.factory_id ?? po.factory_id ?? null,
          shift_id:          sched.shift_id,
          shift_calendar_id: shiftCal.id,
          planned_quantity:  sched.planned_qty_per_day,
          actual_quantity:   0,
          defect_quantity:   0,
          status:            'Released',
          sequence:          sched.sequence,
          start_date:        sched.production_date,
          end_date:          sched.production_date,
          notes:             !isExact ? `Extra working day from plan adjustment` : null,
        }, { transaction: t });

        // Generate Station & Jobs dari routing
        const routings = await db.SPartRoutings.findAll({
          where: { part_id: poProd.part_id, line_id: sched.line_id, active: true, deleted_at: null },
          include: [{
            model:    db.SPartRoutingDetails,
            as:       'details',
            where:    { active: true, deleted_at: null },
            required: false,
          }],
          transaction: t,
        });

        if (routings.length > 0) {
          for (const routing of routings) {
            const woStation = await SWorkOrderStation.create({
              wo_id:            createdWo.id,
              station_id:       routing.station_id,
              sequence:         routing.sequence,
              planned_quantity: createdWo.planned_quantity,
              actual_quantity:  0,
              defect_quantity:  0,
              status:           'Pending',
            }, { transaction: t });

            if (routing.details && routing.details.length > 0) {
              const woJobs = routing.details.map((det) => ({
                wo_station_id: woStation.id,
                job_id:        det.job_id,
                sequence:      det.sequence,
                status:        'Pending',
                operator_id:   null,
              }));
              await SWorkOrderStationJob.bulkCreate(woJobs, { transaction: t });
            }
          }
        }

        // BOM Explosion — kalkulasi material untuk kitting gudang
        const bom = await SBoms.findOne({
          where: { part_id: poProd.part_id, active: true, deleted_at: null },
          include: [{
            model:    SBomDetails,
            as:       'details',
            where:    { active: true, deleted_at: null },
            required: false,
          }],
          transaction: t,
        });

        if (bom && bom.details && bom.details.length > 0) {
          const woMaterials = bom.details.map((detail) => ({
            wo_id:            createdWo.id,
            material_part_id: detail.component_id,
            planned_quantity: parseFloat(detail.quantity) * parseFloat(createdWo.planned_quantity),
            actual_quantity:  0,
            uom:              detail.uom || 'PCS',
          }));
          await SWorkOrderMaterial.bulkCreate(woMaterials, { transaction: t });
        }
      }));

      await po.update({
        status:      'Released',
        released_by: req.user?.id ?? null,
        released_at: new Date(),
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'RELEASE',
        resourceId: po.id,
        description: `Released PO ${po.po_number}, generated ${schedules.length} Work Order(s) with BOM explosion`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: `Production Order released. ${schedules.length} Work Order(s) generated with BOM explosion.`,
        data: { id: po.id, po_number: po.po_number, work_orders_created: schedules.length },
      });
    } catch (error) {
      await t.rollback();
      console.log('[OrderScheduleModule][release]:', error);
      return helper.sendResponse(res, { status: false, code: 500, error: error.message });
    }
  }

  // ── Reschedule ────────────────────────────────────────────────────────────────
  //
  // POST /production-orders/:id/reschedule
  // Body: { new_start_date, new_end_date, reschedule_reason }
  // ─────────────────────────────────────────────────────────────────────────────
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
        return helper.sendResponse(res, { status: false, code: 400, error: 'Only Released Production Orders can be rescheduled' });
      }

      const { new_start_date, new_end_date, reschedule_reason } = validation.value;
      const newStart = new Date(new_start_date);
      const newEnd   = new Date(new_end_date);
      const latestDO = po.latest_delivery_date ? new Date(po.latest_delivery_date) : null;

      if (newEnd <= newStart) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, error: 'new_end_date must be after new_start_date' });
      }
      if (latestDO && newEnd >= latestDO) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false, code: 400,
          error: `new_end_date must be before latest_delivery_date (${po.latest_delivery_date})`,
        });
      }

      const impactedWoCount = await SWorkOrder.count({ where: { po_id: id, deleted_at: null }, transaction: t });

      const impactedByStage = await SWorkOrder.findAll({
        where:      { po_id: id, deleted_at: null },
        attributes: ['sequence'],
        transaction: t,
      });
      const stageWoCounts = {};
      for (const wo of impactedByStage) {
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
        const existingWos = await SWorkOrder.findAll({
          where: { po_id: id, deleted_at: null }, attributes: ['id'], transaction: t,
        });
        const existingWoIds = existingWos.map((w) => w.id);
        const existingStations = await SWorkOrderStation.findAll({
          where: { wo_id: existingWoIds }, attributes: ['id'], transaction: t,
        });
        if (existingStations.length > 0) {
          await SWorkOrderStationJob.destroy({
            where: { wo_station_id: existingStations.map((s) => s.id) }, transaction: t,
          });
          await SWorkOrderStation.destroy({ where: { wo_id: existingWoIds }, transaction: t });
        }
        await SWorkOrder.destroy({ where: { id: existingWoIds }, transaction: t });
      }

      await SProductionOrderSchedule.destroy({ where: { po_id: id }, transaction: t, force: true });
      await SProductionOrderProduct.update({ scheduled_qty: 0 }, { where: { po_id: id }, transaction: t });

      // Revert ke Approved agar workflow generate-schedule → release bisa diulang
      await po.update({
        production_start_date: newStart.toISOString().split('T')[0],
        production_end_date:   newEnd.toISOString().split('T')[0],
        total_scheduled_qty:   0,
        status:                'Approved',
        released_by:           null,
        released_at:           null,
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'production_order', activityCode: 'RESCHEDULE',
        resourceId: po.id, newData: { new_start_date, new_end_date, stage_wo_counts: stageWoCounts },
        description: `Rescheduled PO ${po.po_number}: ${impactedWoCount} WO(s) cancelled across all stages`,
        transaction: t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status: true, code: 200,
        message: `Reschedule logged. ${impactedWoCount} Work Order(s) cancelled across all stages. Regenerate the schedule and re-release.`,
        data: {
          id: po.id, po_number: po.po_number,
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

  // ── Private ───────────────────────────────────────────────────────────────────

  async _getPoEditable(id, transaction) {
    const po = await SProductionOrder.findOne({ where: { id, deleted_at: null }, transaction });
    if (!po)                   return { ok: false, code: 404, error: 'Production Order not found' };
    if (po.status !== 'Draft') return { ok: false, code: 400, error: 'Only Draft Production Orders can be modified' };
    return { ok: true, data: po };
  }
}

export default new OrderScheduleModule();