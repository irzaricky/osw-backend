'use strict';

/**
 * SEEDER GABUNGAN — ASSY-MAIN Line Setup + BOM + Part Routing + SRoutingStationMaterial
 *
 * Menggabungkan dua seeder sebelumnya:
 *   Seeder 1 : Line ASSY-MAIN, Stations, Station Jobs, Shift Calendars, Line Capacity Params
 *   Seeder 2 : BOM Headers + Details, Part Routing Headers + Details, RoutingStationMaterial
 *
 * Urutan eksekusi:
 *   STEP 0  — Bersihkan data lama (child-first)
 *   STEP 1  — Line ASSY-MAIN
 *   STEP 2  — Stations (15 station)
 *   STEP 3  — Station Jobs
 *   STEP 4  — Shift Calendars (copy dari line_id=1)
 *   STEP 5  — Line Capacity Params (dihitung dari shift calendar)
 *   STEP 6  — Ambil part map (dipakai STEP 7–10)
 *   STEP 7  — BOM Headers
 *   STEP 8  — BOM Details
 *   STEP 9  — Part Routing Headers
 *   STEP 10 — Part Routing Details
 *   STEP 11 — RoutingStationMaterial (RSM)
 */

// =========================================================
// HELPERS — shift calendar & takt time (raw SQL, tidak perlu model)
// =========================================================

function getMonthRange(year, month) {
  const pad   = (n) => String(n).padStart(2, '0');
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0);
  return {
    startDate: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    endDate:   `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

function calcNetMinutes(shiftEntries) {
  let productive = 0;
  for (const s of shiftEntries) {
    if (s.category !== 'PRODUCTIVE') continue;
    const [sh, sm] = s.start_time.split(':').map(Number);
    const [eh, em] = s.end_time.split(':').map(Number);
    let start = sh * 60 + sm;
    let end   = eh * 60 + em;
    if (end <= start) end += 24 * 60;
    productive += end - start;
  }
  return productive;
}

async function resolveShiftCalendarParamsSeeder(queryInterface, lineId, startDate, endDate) {
  const [calendars] = await queryInterface.sequelize.query(
    `
      SELECT
        sc.start_date,
        sc.end_date,
        rtc.is_holiday   AS is_holiday,
        sh.shift_number  AS shift_number,
        sh.type          AS type,
        sh.start_time    AS start_time,
        sh.end_time      AS end_time,
        sh.category      AS category
      FROM s_shift_calendars sc
      JOIN s_shifts sh
        ON sh.id = sc.shift_id
       AND sh.active = true
       AND sh.deleted_at IS NULL
      JOIN ref_type_calendars rtc
        ON rtc.id = sc.ref_type_calendar_id
      WHERE sc.line_id    = $1
        AND sc.active     = true
        AND sc.deleted_at IS NULL
        AND sc.start_date <= $3
        AND sc.end_date   >= $2
      ORDER BY sc.start_date ASC
    `,
    { bind: [lineId, startDate, endDate] }
  );

  if (!calendars.length) return null;

  const rangeStart = new Date(startDate);
  const rangeEnd   = new Date(endDate);

  const dayMap = new Map();
  for (const cal of calendars) {
    const calStart  = new Date(cal.start_date);
    const calEnd    = new Date(cal.end_date);
    const loopStart = calStart < rangeStart ? rangeStart : calStart;
    const loopEnd   = calEnd   > rangeEnd   ? rangeEnd   : calEnd;

    for (let d = new Date(loopStart); d <= loopEnd; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      if (!dayMap.has(key)) {
        dayMap.set(key, { is_holiday: cal.is_holiday, regularShifts: [], overtimeShifts: [] });
      }
      const day      = dayMap.get(key);
      day.is_holiday = cal.is_holiday;
      if (cal.type === 'REGULAR')     day.regularShifts.push(cal);
      else if (cal.type === 'NON REGULAR') day.overtimeShifts.push(cal);
    }
  }

  const workingDays  = [];
  const overtimeDays = [];
  for (const [, day] of dayMap) {
    if (!day.is_holiday) workingDays.push(day);
    else overtimeDays.push(day);
  }

  if (workingDays.length === 0) return null;

  const working_days      = workingDays.length;
  const shiftsPerDayArr   = workingDays.map((day) => new Set(day.regularShifts.map((s) => s.shift_number)).size);
  const shifts_per_day    = Math.round(shiftsPerDayArr.reduce((a, b) => a + b, 0) / shiftsPerDayArr.length);
  const netMinutesArr     = workingDays.map((day) => calcNetMinutes(day.regularShifts));
  const avgNetMinutes     = netMinutesArr.reduce((a, b) => a + b, 0) / netMinutesArr.length;
  const working_hours_per_shift = shifts_per_day > 0
    ? parseFloat((avgNetMinutes / 60 / shifts_per_day).toFixed(2))
    : 0;
  const netOvertimeArr    = overtimeDays.map((day) => calcNetMinutes(day.overtimeShifts));
  const avgOvertimeMinutes = netOvertimeArr.length > 0
    ? netOvertimeArr.reduce((a, b) => a + b, 0) / netOvertimeArr.length
    : 0;
  const overtime_hours    = parseFloat((avgOvertimeMinutes / 60).toFixed(2));

  return { working_days, shifts_per_day, working_hours_per_shift, overtime_hours };
}

async function getMaxTaktTimeSeeder(queryInterface, lineId) {
  const [rows] = await queryInterface.sequelize.query(
    `
      SELECT sj.station_id, SUM(j.standard_time) AS takt_time
      FROM s_station_jobs sj
      JOIN s_jobs j
        ON j.id = sj.job_id
       AND j.active = true
       AND j.deleted_at IS NULL
      JOIN s_stations st
        ON st.id = sj.station_id
       AND st.status = true
       AND st.deleted_at IS NULL
      WHERE sj.active = true
        AND sj.deleted_at IS NULL
        AND st.line_id = $1
      GROUP BY sj.station_id
      ORDER BY takt_time DESC
      LIMIT 1
    `,
    { bind: [lineId] }
  );
  return rows.length ? Number(rows[0].takt_time) : 0;
}

// =========================================================
// EXPORT
// =========================================================

export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // -------------------------------------------------------
    // Raw-SQL helpers
    // -------------------------------------------------------
    const q = (sql, bind) =>
      queryInterface.sequelize.query(sql, bind ? { bind } : undefined);

    const oneRow = async (sql, bind) => {
      const [rows] = await q(sql, bind);
      return rows[0] ?? null;
    };

    const getId = async (table, col, val) => {
      const r = await oneRow(`SELECT id FROM ${table} WHERE ${col} = $1 LIMIT 1`, [val]);
      if (!r) throw new Error(`Not found in ${table} where ${col}='${val}'`);
      return r.id;
    };

    const getLineId    = (code)  => getId('s_lines',         'line_code',    code);
    const getStationId = (code)  => getId('s_stations',      'station_code', code);
    const getRoutingId = (code)  => getId('s_part_routings', 'routing_code', code);

    // -------------------------------------------------------
    // STEP 0 — Bersihkan data lama (child dulu, parent belakang)
    // -------------------------------------------------------
    console.log('[STEP 0] Clearing old data...');
    await q(`DELETE FROM s_routing_station_materials`);
    await q(`DELETE FROM s_part_routing_details`);
    await q(`DELETE FROM s_part_routings`);
    await q(`DELETE FROM s_bom_details`);
    await q(`DELETE FROM s_boms`);
    await q(`
      DELETE FROM s_shift_calendars
      WHERE line_id = (SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN')
    `);
    await q(`
      DELETE FROM s_line_capacity_params
      WHERE line_id = (SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN')
    `);
    await q(`
      DELETE FROM s_station_jobs
      WHERE station_id IN (
        SELECT id FROM s_stations
        WHERE line_id = (SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN')
      )
    `);
    await q(`
      DELETE FROM s_stations
      WHERE line_id = (SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN')
    `);
    await queryInterface.bulkDelete('s_lines', { line_code: 'ASSY-MAIN' }, {});
    console.log('[STEP 0] Done.');

    // -------------------------------------------------------
    // STEP 1 — Line ASSY-MAIN
    // -------------------------------------------------------
    console.log('[STEP 1] Creating line ASSY-MAIN...');
    await queryInterface.bulkInsert('s_lines', [
      {
        line_code:  'ASSY-MAIN',
        name:       'Line Assembly E-Bike (Main)',
        factory_id: 1,
        sequence:   5,
        is_active:  true,
        created_at: now,
        updated_at: now,
      },
    ]);
    const lineId = await getLineId('ASSY-MAIN');
    console.log(`[STEP 1] Done. lineId=${lineId}`);

    // -------------------------------------------------------
    // STEP 2 — Stations (15 station)
    // -------------------------------------------------------
    console.log('[STEP 2] Creating stations...');
    await queryInterface.bulkInsert('s_stations', [
      { station_code: 'ST-MAIN-01', name: 'Frame Preparation & Inspection',     line_id: lineId, station_type_id: 1, sequence: 10,  status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-02', name: 'Battery Pack Assembly',               line_id: lineId, station_type_id: 2, sequence: 20,  status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-03', name: 'Wiring Harness Installation',         line_id: lineId, station_type_id: 2, sequence: 30,  status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-04', name: 'Controller Installation',             line_id: lineId, station_type_id: 2, sequence: 40,  status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-05', name: 'Motor & Drive Installation',          line_id: lineId, station_type_id: 2, sequence: 50,  status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-06', name: 'Battery Mounting to Frame',           line_id: lineId, station_type_id: 2, sequence: 60,  status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-07', name: 'Wheel Assembly',                      line_id: lineId, station_type_id: 2, sequence: 70,  status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-08', name: 'Brake System Assembly',               line_id: lineId, station_type_id: 2, sequence: 80,  status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-09', name: 'Handlebar & HMI Assembly',            line_id: lineId, station_type_id: 2, sequence: 90,  status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-10', name: 'Lighting & Accessories Installation', line_id: lineId, station_type_id: 2, sequence: 100, status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-11', name: 'Electrical Function Test',            line_id: lineId, station_type_id: 3, sequence: 110, status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-12', name: 'Charging & Performance Test',         line_id: lineId, station_type_id: 3, sequence: 120, status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-13', name: 'Final Assembly Inspection',           line_id: lineId, station_type_id: 1, sequence: 130, status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-14', name: 'Packing & Labeling',                  line_id: lineId, station_type_id: 6, sequence: 140, status: true, created_at: now, updated_at: now },
      { station_code: 'ST-MAIN-15', name: 'Finished Goods Transfer',             line_id: lineId, station_type_id: 6, sequence: 150, status: true, created_at: now, updated_at: now },
    ]);

    // Cache semua station ID
    const stIds = {};
    for (let i = 1; i <= 15; i++) {
      const code = `ST-MAIN-${String(i).padStart(2, '0')}`;
      stIds[code] = await getStationId(code);
    }
    console.log('[STEP 2] Done.');

    // -------------------------------------------------------
    // STEP 3 — Station Jobs
    // -------------------------------------------------------
    console.log('[STEP 3] Creating station jobs...');
    const stationJobsMap = {
      'ST-MAIN-01': [
        { job_id: 1,  sequence: 10 },
        { job_id: 2,  sequence: 20 },
        { job_id: 3,  sequence: 30 },
        { job_id: 4,  sequence: 40 },
        { job_id: 5,  sequence: 50 },
      ],
      'ST-MAIN-02': [
        { job_id: 56, sequence: 10 },
        { job_id: 57, sequence: 20 },
        { job_id: 58, sequence: 30 },
        { job_id: 59, sequence: 40 },
        { job_id: 60, sequence: 50 },
        { job_id: 62, sequence: 60 },
      ],
      'ST-MAIN-03': [
        { job_id: 6,  sequence: 10 },
        { job_id: 33, sequence: 20 },
      ],
      'ST-MAIN-04': [
        { job_id: 7,  sequence: 10 },
        { job_id: 34, sequence: 20 },
      ],
      'ST-MAIN-05': [
        { job_id: 8,  sequence: 10 },
        { job_id: 35, sequence: 20 },
      ],
      'ST-MAIN-06': [
        { job_id: 9,  sequence: 10 },
        { job_id: 36, sequence: 20 },
      ],
      'ST-MAIN-07': [
        { job_id: 38, sequence: 10 },
        { job_id: 40, sequence: 20 },
      ],
      'ST-MAIN-08': [
        { job_id: 39, sequence: 10 },
        { job_id: 40, sequence: 20 },
      ],
      'ST-MAIN-09': [
        { job_id: 41, sequence: 10 },
        { job_id: 42, sequence: 20 },
      ],
      'ST-MAIN-10': [
        { job_id: 43, sequence: 10 },
      ],
      'ST-MAIN-11': [
        { job_id: 10, sequence: 10 },
        { job_id: 37, sequence: 20 },
      ],
      'ST-MAIN-12': [
        { job_id: 63, sequence: 10 },
        { job_id: 65, sequence: 20 },
        { job_id: 66, sequence: 30 },
      ],
      'ST-MAIN-13': [
        { job_id: 44, sequence: 10 },
        { job_id: 45, sequence: 20 },
        { job_id: 48, sequence: 30 },
        { job_id: 49, sequence: 40 },
      ],
      'ST-MAIN-14': [
        { job_id: 50, sequence: 10 },
        { job_id: 51, sequence: 20 },
        { job_id: 52, sequence: 30 },
        { job_id: 53, sequence: 40 },
      ],
      'ST-MAIN-15': [
        { job_id: 54, sequence: 10 },
        { job_id: 55, sequence: 20 },
      ],
    };

    const stationJobsRows = [];
    for (const [stationCode, jobs] of Object.entries(stationJobsMap)) {
      for (const { job_id, sequence } of jobs) {
        stationJobsRows.push({
          station_id: stIds[stationCode],
          job_id,
          sequence,
          mandatory:  true,
          active:     true,
          created_at: now,
          updated_at: now,
        });
      }
    }
    await queryInterface.bulkInsert('s_station_jobs', stationJobsRows);
    console.log(`[STEP 3] Done. ${stationJobsRows.length} station job rows inserted.`);

    // -------------------------------------------------------
    // STEP 4 — Shift Calendars (copy working days dari line_id=1)
    // -------------------------------------------------------
    console.log('[STEP 4] Copying shift calendars...');
    const [calendarRows] = await queryInterface.sequelize.query(`
      SELECT sc.shift_id, sc.start_date, sc.end_date, sc.ref_type_calendar_id, sc.date_event
      FROM   s_shift_calendars sc
      JOIN   ref_type_calendars rtc ON rtc.id = sc.ref_type_calendar_id
      WHERE  sc.line_id    = 1
        AND  rtc.is_holiday = false
        AND  sc.start_date >= '2026-05-01'
        AND  sc.start_date <= '2026-07-31'
        AND  sc.deleted_at  IS NULL
    `);

    if (calendarRows.length > 0) {
      await queryInterface.bulkInsert(
        's_shift_calendars',
        calendarRows.map((row) => ({
          line_id:              lineId,
          shift_id:             row.shift_id,
          start_date:           row.start_date,
          end_date:             row.end_date,
          ref_type_calendar_id: row.ref_type_calendar_id,
          date_event:           row.date_event,
          active:               true,
          created_at:           now,
          updated_at:           now,
        }))
      );
    }
    console.log(`[STEP 4] Done. ${calendarRows.length} calendar rows copied.`);

    // -------------------------------------------------------
    // STEP 5 — Line Capacity Params (dihitung dari shift calendar)
    // -------------------------------------------------------
    console.log('[STEP 5] Calculating line capacity params...');
    const DEFAULT_EFFICIENCY_FACTOR = 0.85;
    const DEFAULT_MANPOWER          = 20;
    const periodsToCalculate        = [
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ];

    const maxTaktTime       = await getMaxTaktTimeSeeder(queryInterface, lineId);
    const capacityParamRows = [];

    for (const { year, month } of periodsToCalculate) {
      const { startDate, endDate } = getMonthRange(year, month);
      const calendarParams = await resolveShiftCalendarParamsSeeder(queryInterface, lineId, startDate, endDate);

      if (!calendarParams) {
        throw new Error(
          `Shift calendar tidak ditemukan untuk line ASSY-MAIN periode ${year}-${String(month).padStart(2, '0')}. ` +
          `Pastikan source line_id=1 punya shift calendar pada periode tersebut sebelum seeder dijalankan.`
        );
      }

      capacityParamRows.push({
        line_id:                         lineId,
        default_working_days:            calendarParams.working_days,
        default_shifts_per_day:          calendarParams.shifts_per_day,
        default_working_hours_per_shift: calendarParams.working_hours_per_shift,
        default_efficiency_factor:       DEFAULT_EFFICIENCY_FACTOR,
        default_overtime_hours:          calendarParams.overtime_hours,
        default_manpower:                DEFAULT_MANPOWER,
        default_max_takt_time:           maxTaktTime,
        param_year:                      year,
        param_month:                     month,
        created_at:                      now,
        updated_at:                      now,
      });
    }

    await queryInterface.bulkInsert('s_line_capacity_params', capacityParamRows);
    console.log(`[STEP 5] Done. ${capacityParamRows.length} capacity param rows inserted.`);

    // -------------------------------------------------------
    // STEP 6 — Ambil part map (dipakai STEP 7–11)
    // -------------------------------------------------------
    console.log('[STEP 6] Loading part map...');
    const [partRows] = await q(`
      SELECT id, part_number, uom_id, part_type_code
      FROM s_parts
      WHERE deleted_at IS NULL
    `);
    const partMap = Object.fromEntries(
      partRows.map((r) => [r.part_number, { id: r.id, uom_id: r.uom_id, type: r.part_type_code }])
    );
    const getPart = (code) => {
      const p = partMap[code];
      if (!p) throw new Error(`Part not found: ${code}`);
      return p;
    };
    console.log(`[STEP 6] Done. ${partRows.length} parts loaded.`);

    // -------------------------------------------------------
    // STEP 7 — BOM Headers
    // -------------------------------------------------------
    console.log('[STEP 7] Inserting BOM headers...');

    const voltProducts = [
      'VOBKME2025', 'VOGRME2025', 'VOWHME2025',
      'VOBKME2026', 'VOGRME2026', 'VOWHME2026',
    ];
    const ecoProducts = [
      'ECBKME2025', 'ECGRME2025', 'ECWHME2025',
      'ECBKME2026', 'ECGRME2026', 'ECWHME2026',
    ];

    const voltComponents = [
      { code: 'ASSY-WHEEL-F-26',       qty: 1,  level: 1 },
      { code: 'ASSY-WHEEL-R-MOTOR-26', qty: 1,  level: 1 },
      { code: 'ASSY-HANDLEBAR-VC',     qty: 1,  level: 1 },
      { code: 'PART-FRAME-VC',         qty: 1,  level: 1 },
      { code: 'PART-FORK-26',          qty: 1,  level: 1 },
      { code: 'PART-BATT-48V',         qty: 1,  level: 1 },
      { code: 'PART-CONTROLLER-48V',   qty: 1,  level: 1 },
      { code: 'PART-BRAKE-SET',        qty: 1,  level: 1 },
      { code: 'PART-SADDLE',           qty: 1,  level: 1 },
      { code: 'PART-SEAT-CLAMP',       qty: 1,  level: 1 },
      { code: 'PART-PEDAL-SET',        qty: 1,  level: 1 },
      { code: 'PART-CHAIN',            qty: 1,  level: 1 },
      { code: 'PART-DISPLAY-LCD',      qty: 1,  level: 1 },
      { code: 'PART-THROTTLE',         qty: 1,  level: 1 },
      { code: 'PART-WIRING-HARNESS',   qty: 1,  level: 1 },
      { code: 'PART-KICKSTAND',        qty: 1,  level: 1 },
      { code: 'PART-RD-UNIT',          qty: 1,  level: 1 },
      { code: 'PART-RD-HANGER',        qty: 1,  level: 1 },
      { code: 'PART-HEADSET',          qty: 1,  level: 1 },
      { code: 'PART-SEATPOST',         qty: 1,  level: 1 },
    ];
    const ecoComponents = [
      { code: 'ASSY-WHEEL-F-20',       qty: 1,  level: 1 },
      { code: 'ASSY-WHEEL-R-MOTOR-20', qty: 1,  level: 1 },
      { code: 'ASSY-HANDLEBAR-VC',     qty: 1,  level: 1 },
      { code: 'PART-FRAME-EF',         qty: 1,  level: 1 },
      { code: 'PART-FORK-20',          qty: 1,  level: 1 },
      { code: 'PART-BATT-36V',         qty: 1,  level: 1 },
      { code: 'PART-CONTROLLER-36V',   qty: 1,  level: 1 },
      { code: 'PART-BRAKE-SET',        qty: 1,  level: 1 },
      { code: 'PART-SADDLE',           qty: 1,  level: 1 },
      { code: 'PART-SEAT-CLAMP',       qty: 1,  level: 1 },
      { code: 'PART-PEDAL-SET',        qty: 1,  level: 1 },
      { code: 'PART-CHAIN',            qty: 1,  level: 1 },
      { code: 'PART-DISPLAY-LCD',      qty: 1,  level: 1 },
      { code: 'PART-THROTTLE',         qty: 1,  level: 1 },
      { code: 'PART-WIRING-HARNESS',   qty: 1,  level: 1 },
      { code: 'PART-KICKSTAND',        qty: 1,  level: 1 },
      { code: 'PART-RD-UNIT',          qty: 1,  level: 1 },
      { code: 'PART-RD-HANGER',        qty: 1,  level: 1 },
      { code: 'PART-HEADSET',          qty: 1,  level: 1 },
      { code: 'PART-SEATPOST',         qty: 1,  level: 1 },
    ];

    const subAssemblies = {
      'ASSY-WHEEL-F-26': [
        { code: 'PART-TIRE-26',   qty: 1,  level: 2 },
        { code: 'PART-RIM-26',    qty: 1,  level: 2 },
        { code: 'PART-SPOKE-SS',  qty: 36, level: 2 },
        { code: 'ASSY-HUB-F',     qty: 1,  level: 2 },
        { code: 'PART-NUT-M12',   qty: 2,  level: 2 },
      ],
      'ASSY-WHEEL-F-20': [
        { code: 'PART-TIRE-20',   qty: 1,  level: 2 },
        { code: 'PART-RIM-20',    qty: 1,  level: 2 },
        { code: 'PART-SPOKE-SS',  qty: 36, level: 2 },
        { code: 'ASSY-HUB-F',     qty: 1,  level: 2 },
        { code: 'PART-NUT-M12',   qty: 2,  level: 2 },
      ],
      'ASSY-WHEEL-R-MOTOR-26': [
        { code: 'PART-TIRE-26',       qty: 1,  level: 2 },
        { code: 'PART-RIM-26',        qty: 1,  level: 2 },
        { code: 'PART-SPOKE-SS',      qty: 36, level: 2 },
        { code: 'ASSY-MOTOR-HUB-48V', qty: 1,  level: 2 },
        { code: 'PART-FREEWHEEL',     qty: 1,  level: 2 },
        { code: 'PART-NUT-M12',       qty: 2,  level: 2 },
      ],
      'ASSY-WHEEL-R-MOTOR-20': [
        { code: 'PART-TIRE-20',       qty: 1,  level: 2 },
        { code: 'PART-RIM-20',        qty: 1,  level: 2 },
        { code: 'PART-SPOKE-SS',      qty: 36, level: 2 },
        { code: 'ASSY-MOTOR-HUB-36V', qty: 1,  level: 2 },
        { code: 'PART-FREEWHEEL',     qty: 1,  level: 2 },
        { code: 'PART-NUT-M12',       qty: 2,  level: 2 },
      ],
      'ASSY-HANDLEBAR-VC': [
        { code: 'PART-STEM',        qty: 1, level: 2 },
        { code: 'PART-GRIP-RUBBER', qty: 2, level: 2 },
      ],
      'ASSY-HUB-F': [
        { code: 'PART-AXLE-F',      qty: 1, level: 3 },
        { code: 'PART-BEARING-608', qty: 2, level: 3 },
      ],
      'ASSY-MOTOR-HUB-48V': [
        { code: 'PART-AXLE-R',      qty: 1, level: 3 },
        { code: 'PART-BEARING-608', qty: 2, level: 3 },
      ],
      'ASSY-MOTOR-HUB-36V': [
        { code: 'PART-AXLE-R',      qty: 1, level: 3 },
        { code: 'PART-BEARING-608', qty: 2, level: 3 },
      ],
      'PART-BATT-48V': [
        { code: 'PART-BATT-CASE',  qty: 1,  level: 2 },
        { code: 'PART-BMS-48V',    qty: 1,  level: 2 },
        { code: 'PART-CELL-18650', qty: 52, level: 2 },
      ],
      'PART-BATT-36V': [
        { code: 'PART-BATT-CASE',  qty: 1,  level: 2 },
        { code: 'PART-BMS-36V',    qty: 1,  level: 2 },
        { code: 'PART-CELL-18650', qty: 40, level: 2 },
      ],
    };

    const bomHeaderRows    = [];
    const parentToBomDetails = [];
    let bomCounter = 1;

    const addBomHeader = (parentCode, components) => {
      const part      = getPart(parentCode);
      const bomNumber = `BOM-${parentCode}-${String(bomCounter++).padStart(3, '0')}`;
      bomHeaderRows.push({
        bom_number:        bomNumber,
        description:       `BOM Standar Manufaktur untuk ${parentCode}`,
        parent_part_id:    part.id,
        notes:             `Seeder otomatis produksi untuk item tipe ${parentCode}`,
        bom_version:       1,
        uom_id:            part.uom_id,
        doc_status:        'Approved',
        activation_status: 'Active',
        reject_reason:     null,
        created_by:        1,
        approved_by:       1,
        approved_at:       now,
        activated_at:      now,
        created_at:        now,
        updated_at:        now,
        deleted_at:        null,
      });
      parentToBomDetails.push({ bomNumber, parentCode, components });
    };

    for (const code of voltProducts) addBomHeader(code, voltComponents);
    for (const code of ecoProducts)  addBomHeader(code, ecoComponents);
    for (const [code, comps] of Object.entries(subAssemblies)) addBomHeader(code, comps);

    await queryInterface.bulkInsert('s_boms', bomHeaderRows);
    console.log(`[STEP 7] Done. ${bomHeaderRows.length} BOM headers inserted.`);

    // -------------------------------------------------------
    // STEP 8 — BOM Details
    // -------------------------------------------------------
    console.log('[STEP 8] Inserting BOM details...');
    const [insertedBoms] = await q(`SELECT id, bom_number, parent_part_id FROM s_boms`);
    const bomIdByNumber  = Object.fromEntries(insertedBoms.map((b) => [b.bom_number, b.id]));
    const bomIdByPartId  = Object.fromEntries(insertedBoms.map((b) => [b.parent_part_id, b.id]));

    const bomDetailRows = [];
    for (const { bomNumber, components } of parentToBomDetails) {
      const bomId = bomIdByNumber[bomNumber];
      let seq = 1;
      for (const comp of components) {
        const part = getPart(comp.code);
        bomDetailRows.push({
          bom_id:           bomId,
          part_id:          part.id,
          qty_required:     comp.qty,
          level:            comp.level,
          type:             part.type,
          notes:            `Komponen untuk ${bomNumber}`,
          uom_id:           part.uom_id,
          scrap_percentage: 0.00,
          sequence:         seq++,
          child_bom_id:     bomIdByPartId[part.id] ?? null,
          created_at:       now,
          updated_at:       now,
          deleted_at:       null,
        });
      }
    }
    await queryInterface.bulkInsert('s_bom_details', bomDetailRows);
    console.log(`[STEP 8] Done. ${bomDetailRows.length} BOM detail rows inserted.`);

    // -------------------------------------------------------
    // STEP 9 — Part Routing Headers
    // -------------------------------------------------------
    console.log('[STEP 9] Inserting routing headers...');

    const routingDefs = [
      { code: 'ROUTE-VOLT-STD-1', partCode: 'VOBKME2025',          desc: 'Routing Assembly VOLT STALLION BLACK GEN 2025' },
      { code: 'ROUTE-VOLT-STD-2', partCode: 'VOGRME2025',          desc: 'Routing Assembly VOLT ARMOR GREY GEN 2025'     },
      { code: 'ROUTE-VOLT-STD-3', partCode: 'VOWHME2025',          desc: 'Routing Assembly VOLT ROYAL WHITE GEN 2025'    },
      { code: 'ROUTE-VOLT-STD-4', partCode: 'VOBKME2026',          desc: 'Routing Assembly VOLT STALLION BLACK GEN 2026' },
      { code: 'ROUTE-VOLT-STD-5', partCode: 'VOGRME2026',          desc: 'Routing Assembly VOLT ARMOR GREY GEN 2026'     },
      { code: 'ROUTE-VOLT-STD-6', partCode: 'VOWHME2026',          desc: 'Routing Assembly VOLT ROYAL WHITE GEN 2026'    },
      { code: 'ROUTE-ECO-STD-1',  partCode: 'ECBKME2025',          desc: 'Routing Assembly ECO STALLION BLACK GEN 2025'  },
      { code: 'ROUTE-ECO-STD-2',  partCode: 'ECGRME2025',          desc: 'Routing Assembly ECO ARMOR GREY GEN 2025'      },
      { code: 'ROUTE-ECO-STD-3',  partCode: 'ECWHME2025',          desc: 'Routing Assembly ECO ROYAL WHITE GEN 2025'     },
      { code: 'ROUTE-ECO-STD-4',  partCode: 'ECBKME2026',          desc: 'Routing Assembly ECO STALLION BLACK GEN 2026'  },
      { code: 'ROUTE-ECO-STD-5',  partCode: 'ECGRME2026',          desc: 'Routing Assembly ECO ARMOR GREY GEN 2026'      },
      { code: 'ROUTE-ECO-STD-6',  partCode: 'ECWHME2026',          desc: 'Routing Assembly ECO ROYAL WHITE GEN 2026'     },
      { code: 'ROUTE-WHL-F-26',   partCode: 'ASSY-WHEEL-F-26',     desc: 'Routing Front Wheel Assy 26 Inch (Volt)'       },
      { code: 'ROUTE-WHL-F-20',   partCode: 'ASSY-WHEEL-F-20',     desc: 'Routing Front Wheel Assy 20 Inch (Eco)'        },
      { code: 'ROUTE-WHL-R-26',   partCode: 'ASSY-WHEEL-R-MOTOR-26', desc: 'Routing Rear Motor Wheel Assy 26" 350W (Volt)' },
      { code: 'ROUTE-WHL-R-20',   partCode: 'ASSY-WHEEL-R-MOTOR-20', desc: 'Routing Rear Motor Wheel Assy 20" 250W (Eco)'  },
      { code: 'ROUTE-HNDLBR-VC',  partCode: 'ASSY-HANDLEBAR-VC',   desc: 'Routing Handlebar Set VoltCity'                },
      { code: 'ROUTE-HUB-F',      partCode: 'ASSY-HUB-F',          desc: 'Routing Front Hub System Assembly'             },
      { code: 'ROUTE-MTR-48V',    partCode: 'ASSY-MOTOR-HUB-48V',  desc: 'Routing Hub Motor 48V Sub-Assy (Volt)'         },
      { code: 'ROUTE-MTR-36V',    partCode: 'ASSY-MOTOR-HUB-36V',  desc: 'Routing Hub Motor 36V Sub-Assy (Eco)'          },
      { code: 'ROUTE-FRM-VC',     partCode: 'PART-FRAME-VC',        desc: 'Routing Main Frame VoltCity Unpainted'         },
      { code: 'ROUTE-FRM-EF',     partCode: 'PART-FRAME-EF',        desc: 'Routing Main Frame EcoFold Unpainted'          },
      { code: 'ROUTE-BATT-48V',   partCode: 'PART-BATT-48V',        desc: 'Routing Lithium Battery Pack 48V 15Ah (Volt)'  },
      { code: 'ROUTE-BATT-36V',   partCode: 'PART-BATT-36V',        desc: 'Routing Lithium Battery Pack 36V 10Ah (Eco)'   },
    ];

    await queryInterface.bulkInsert(
      's_part_routings',
      routingDefs.map((r) => ({
        routing_code: r.code,
        part_id:      getPart(r.partCode).id,
        line_id:      lineId,
        version:      1,
        is_default:   true,
        active:       true,
        description:  r.desc,
        created_at:   now,
        updated_at:   now,
      }))
    );
    console.log(`[STEP 9] Done. ${routingDefs.length} routing headers inserted.`);

    // -------------------------------------------------------
    // STEP 10 — Part Routing Details
    //
    // Sumber kebenaran: seeder 2 (lebih lengkap dari seeder 1).
    // Format: [seq, stationCode, jobId, stdTime, setupTime, moveTime, manpower]
    // -------------------------------------------------------
    console.log('[STEP 10] Inserting routing details...');

    const voltAssySteps = [
      [10,  'ST-MAIN-01', 1,    120,  0,   5,  1],
      [20,  'ST-MAIN-01', 2,    240,  0,   5,  1],
      [30,  'ST-MAIN-01', 3,    300,  30,  5,  1],
      [40,  'ST-MAIN-01', 4,    360,  30,  5,  2],
      [50,  'ST-MAIN-01', 5,    180,  0,   10, 1],
      [60,  'ST-MAIN-02', 56,   180,  0,   5,  1],
      [70,  'ST-MAIN-02', 57,   120,  0,   5,  1],
      [80,  'ST-MAIN-02', 58,   600,  0,   5,  2],
      [90,  'ST-MAIN-02', 59,   480,  0,   5,  2],
      [100, 'ST-MAIN-02', 60,   900,  0,   10, 0],
      [110, 'ST-MAIN-02', 62,   180,  0,   5,  1],
      [120, 'ST-MAIN-03', 6,    360,  30,  5,  2],
      [130, 'ST-MAIN-03', 33,   120,  0,   5,  1],
      [140, 'ST-MAIN-04', 7,    300,  30,  5,  1],
      [150, 'ST-MAIN-04', 34,   120,  0,   5,  1],
      [160, 'ST-MAIN-05', 8,    420,  30,  5,  2],
      [170, 'ST-MAIN-05', 35,   150,  0,   5,  1],
      [180, 'ST-MAIN-06', 9,    360,  30,  5,  1],
      [190, 'ST-MAIN-06', 36,   120,  0,   5,  1],
      [200, 'ST-MAIN-07', 38,   240,  30,  5,  2],
      [210, 'ST-MAIN-07', 40,   180,  0,   5,  1],
      [220, 'ST-MAIN-08', 39,   240,  30,  5,  1],
      [230, 'ST-MAIN-08', 40,   180,  30,  5,  1],
      [240, 'ST-MAIN-09', 41,   180,  30,  5,  1],
      [250, 'ST-MAIN-09', 42,   120,  0,   5,  1],
      [260, 'ST-MAIN-10', 43,   180,  0,   5,  1],
      [270, 'ST-MAIN-11', 10,   300,  0,   5,  1],
      [280, 'ST-MAIN-11', 37,   120,  0,   5,  1],
      [290, 'ST-MAIN-12', 63,  1200,  0,   10, 2],
      [300, 'ST-MAIN-12', 65,   300,  0,   5,  1],
      [310, 'ST-MAIN-12', 66,   480,  0,   5,  1],
      [320, 'ST-MAIN-13', 44,   180,  0,   5,  1],
      [330, 'ST-MAIN-13', 45,   120,  0,   5,  1],
      [340, 'ST-MAIN-13', 48,   180,  0,   5,  1],
      [350, 'ST-MAIN-13', 49,    60,  0,   5,  1],
      [360, 'ST-MAIN-14', 50,   120,  0,   5,  1],
      [370, 'ST-MAIN-14', 51,    60,  0,   5,  1],
      [380, 'ST-MAIN-14', 52,   240,  0,   5,  1],
      [390, 'ST-MAIN-14', 53,   120,  0,   5,  1],
      [400, 'ST-MAIN-15', 54,   120,  0,   0,  1],
      [410, 'ST-MAIN-15', 55,    60,  0,   0,  1],
    ];

    const ecoAssySteps = [
      [10,  'ST-MAIN-01', 1,    120,  0,   5,  1],
      [20,  'ST-MAIN-01', 2,    180,  0,   5,  1],
      [30,  'ST-MAIN-01', 3,    240,  30,  5,  1],
      [40,  'ST-MAIN-01', 4,    300,  30,  5,  1],
      [50,  'ST-MAIN-01', 5,    180,  0,   10, 1],
      [60,  'ST-MAIN-02', 56,   150,  0,   5,  1],
      [70,  'ST-MAIN-02', 57,   120,  0,   5,  1],
      [80,  'ST-MAIN-02', 58,   420,  0,   5,  2],
      [90,  'ST-MAIN-02', 59,   300,  0,   5,  2],
      [100, 'ST-MAIN-02', 60,   600,  0,   10, 1],
      [110, 'ST-MAIN-02', 62,   180,  0,   5,  1],
      [120, 'ST-MAIN-03', 6,    300,  30,  5,  1],
      [130, 'ST-MAIN-03', 33,   120,  0,   5,  1],
      [140, 'ST-MAIN-04', 7,    240,  30,  5,  1],
      [150, 'ST-MAIN-04', 34,   120,  0,   5,  1],
      [160, 'ST-MAIN-05', 8,    360,  30,  5,  1],
      [170, 'ST-MAIN-05', 35,   120,  0,   5,  1],
      [180, 'ST-MAIN-06', 9,    300,  30,  5,  1],
      [190, 'ST-MAIN-06', 36,   120,  0,   5,  1],
      [200, 'ST-MAIN-07', 38,   210,  30,  5,  2],
      [210, 'ST-MAIN-07', 40,   150,  0,   5,  1],
      [220, 'ST-MAIN-08', 39,   210,  30,  5,  1],
      [230, 'ST-MAIN-08', 40,   150,  30,  5,  1],
      [240, 'ST-MAIN-09', 41,   180,  30,  5,  1],
      [250, 'ST-MAIN-09', 42,   120,  0,   5,  1],
      [260, 'ST-MAIN-10', 43,   150,  0,   5,  1],
      [270, 'ST-MAIN-11', 10,   240,  0,   5,  1],
      [280, 'ST-MAIN-11', 37,   120,  0,   5,  1],
      [290, 'ST-MAIN-12', 63,   900,  0,   10, 2],
      [300, 'ST-MAIN-12', 65,   300,  0,   5,  1],
      [310, 'ST-MAIN-12', 66,   360,  0,   5,  1],
      [320, 'ST-MAIN-13', 44,   180,  0,   5,  1],
      [330, 'ST-MAIN-13', 45,   120,  0,   5,  1],
      [340, 'ST-MAIN-13', 48,   180,  0,   5,  1],
      [350, 'ST-MAIN-13', 49,    60,  0,   5,  1],
      [360, 'ST-MAIN-14', 50,   120,  0,   5,  1],
      [370, 'ST-MAIN-14', 51,    60,  0,   5,  1],
      [380, 'ST-MAIN-14', 52,   180,  0,   5,  1],
      [390, 'ST-MAIN-14', 53,   120,  0,   5,  1],
      [400, 'ST-MAIN-15', 54,   120,  0,   0,  1],
      [410, 'ST-MAIN-15', 55,    60,  0,   0,  1],
    ];

    const wheelF26Steps = [
      [10, 'ST-MAIN-07', 38, 240, 30, 5, 2],
      [20, 'ST-MAIN-07', 40, 120, 0,  5, 1],
    ];
    const wheelF20Steps = [
      [10, 'ST-MAIN-07', 38, 210, 30, 5, 2],
      [20, 'ST-MAIN-07', 40, 120, 0,  5, 1],
    ];
    const wheelR26Steps = [
      [10, 'ST-MAIN-05', 8,  420, 30, 5, 2],
      [20, 'ST-MAIN-05', 35, 150, 0,  5, 1],
      [30, 'ST-MAIN-07', 38, 240, 30, 5, 2],
      [40, 'ST-MAIN-07', 40, 120, 0,  5, 1],
    ];
    const wheelR20Steps = [
      [10, 'ST-MAIN-05', 8,  360, 30, 5, 1],
      [20, 'ST-MAIN-05', 35, 120, 0,  5, 1],
      [30, 'ST-MAIN-07', 38, 210, 30, 5, 2],
      [40, 'ST-MAIN-07', 40, 120, 0,  5, 1],
    ];
    const handlebarSteps = [
      [10, 'ST-MAIN-09', 41, 180, 30, 5, 1],
      [20, 'ST-MAIN-09', 42, 120, 0,  5, 1],
    ];
    const hubFSteps = [
      [10, 'ST-MAIN-07', 38, 180, 30, 5, 1],
    ];
    const motorHub48vSteps = [
      [10, 'ST-MAIN-05', 8,  420, 30, 5, 2],
      [20, 'ST-MAIN-05', 35, 150, 0,  5, 1],
    ];
    const motorHub36vSteps = [
      [10, 'ST-MAIN-05', 8,  360, 30, 5, 1],
      [20, 'ST-MAIN-05', 35, 120, 0,  5, 1],
    ];
    const frameVoltSteps = [
      [10, 'ST-MAIN-01', 1,  120, 0,  5, 1],
      [20, 'ST-MAIN-01', 2,  240, 0,  5, 1],
      [30, 'ST-MAIN-01', 3,  300, 30, 5, 1],
      [40, 'ST-MAIN-01', 4,  360, 30, 5, 2],
      [50, 'ST-MAIN-01', 5,  180, 0,  5, 1],
    ];
    const frameEcoSteps = [
      [10, 'ST-MAIN-01', 1,  120, 0,  5, 1],
      [20, 'ST-MAIN-01', 2,  180, 0,  5, 1],
      [30, 'ST-MAIN-01', 3,  240, 30, 5, 1],
      [40, 'ST-MAIN-01', 4,  300, 30, 5, 1],
      [50, 'ST-MAIN-01', 5,  180, 0,  5, 1],
    ];
    const batt48vSteps = [
      [10, 'ST-MAIN-02', 56, 180, 0, 5,  1],
      [20, 'ST-MAIN-02', 57, 120, 0, 5,  1],
      [30, 'ST-MAIN-02', 58, 600, 0, 5,  2],
      [40, 'ST-MAIN-02', 59, 480, 0, 5,  2],
      [50, 'ST-MAIN-02', 60, 900, 0, 10, 0],
      [60, 'ST-MAIN-02', 62, 180, 0, 5,  1],
    ];
    const batt36vSteps = [
      [10, 'ST-MAIN-02', 56, 120, 0, 5,  1],
      [20, 'ST-MAIN-02', 57, 120, 0, 5,  1],
      [30, 'ST-MAIN-02', 58, 420, 0, 5,  2],
      [40, 'ST-MAIN-02', 59, 300, 0, 5,  2],
      [50, 'ST-MAIN-02', 60, 600, 0, 10, 1],
      [60, 'ST-MAIN-02', 62, 180, 0, 5,  1],
    ];

    const buildDetailRows = async (steps, routingCodes) => {
      const rows = [];
      for (const code of routingCodes) {
        const routingId = await getRoutingId(code);
        for (const [seq, stCode, jobId, stdTime, setupTime, moveTime, manpower] of steps) {
          rows.push({
            routing_id:        routingId,
            sequence:          seq,
            station_id:        stIds[stCode],
            job_id:            jobId,
            standard_time:     stdTime,
            setup_time:        setupTime,
            queue_time:        0,
            move_time:         moveTime,
            manpower_required: manpower,
            created_at:        now,
            updated_at:        now,
          });
        }
      }
      return rows;
    };

    const voltRoutings = ['ROUTE-VOLT-STD-1', 'ROUTE-VOLT-STD-2', 'ROUTE-VOLT-STD-3', 'ROUTE-VOLT-STD-4', 'ROUTE-VOLT-STD-5', 'ROUTE-VOLT-STD-6'];
    const ecoRoutings  = ['ROUTE-ECO-STD-1',  'ROUTE-ECO-STD-2',  'ROUTE-ECO-STD-3',  'ROUTE-ECO-STD-4',  'ROUTE-ECO-STD-5',  'ROUTE-ECO-STD-6'];

    const allDetailRows = [
      ...await buildDetailRows(voltAssySteps,    voltRoutings),
      ...await buildDetailRows(ecoAssySteps,     ecoRoutings),
      ...await buildDetailRows(wheelF26Steps,    ['ROUTE-WHL-F-26']),
      ...await buildDetailRows(wheelF20Steps,    ['ROUTE-WHL-F-20']),
      ...await buildDetailRows(wheelR26Steps,    ['ROUTE-WHL-R-26']),
      ...await buildDetailRows(wheelR20Steps,    ['ROUTE-WHL-R-20']),
      ...await buildDetailRows(handlebarSteps,   ['ROUTE-HNDLBR-VC']),
      ...await buildDetailRows(hubFSteps,        ['ROUTE-HUB-F']),
      ...await buildDetailRows(motorHub48vSteps, ['ROUTE-MTR-48V']),
      ...await buildDetailRows(motorHub36vSteps, ['ROUTE-MTR-36V']),
      ...await buildDetailRows(frameVoltSteps,   ['ROUTE-FRM-VC']),
      ...await buildDetailRows(frameEcoSteps,    ['ROUTE-FRM-EF']),
      ...await buildDetailRows(batt48vSteps,     ['ROUTE-BATT-48V']),
      ...await buildDetailRows(batt36vSteps,     ['ROUTE-BATT-36V']),
    ];

    await queryInterface.bulkInsert('s_part_routing_details', allDetailRows);
    console.log(`[STEP 10] Done. ${allDetailRows.length} routing detail rows inserted.`);

    // -------------------------------------------------------
    // STEP 11 — RoutingStationMaterial (RSM)
    //
    // Hanya station yang benar-benar mengkonsumsi material baru.
    // ST-11 s/d ST-15 (test/inspection/packing/transfer) tidak ada di sini — by design.
    // -------------------------------------------------------
    console.log('[STEP 11] Inserting RoutingStationMaterial...');

    const rsmEntries = [];
    const addRsm = (routingCode, stationCode, materials) => {
      for (const { partCode, qty } of materials) {
        rsmEntries.push({ routingCode, stationCode, partCode, qty });
      }
    };

    // VOLT full-assembly
    for (const rc of voltRoutings) {
      addRsm(rc, 'ST-MAIN-01', [
        { partCode: 'PART-FRAME-VC',       qty: 1 },
        { partCode: 'PART-FORK-26',        qty: 1 },
        { partCode: 'PART-HEADSET',        qty: 1 },
        { partCode: 'PART-SEATPOST',       qty: 1 },
        { partCode: 'PART-SEAT-CLAMP',     qty: 1 },
        { partCode: 'PART-SADDLE',         qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-02', [
        { partCode: 'PART-BATT-48V',       qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-03', [
        { partCode: 'PART-WIRING-HARNESS', qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-04', [
        { partCode: 'PART-CONTROLLER-48V', qty: 1 },
        { partCode: 'PART-DISPLAY-LCD',    qty: 1 },
        { partCode: 'PART-THROTTLE',       qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-07', [
        { partCode: 'ASSY-WHEEL-F-26',       qty: 1 },
        { partCode: 'ASSY-WHEEL-R-MOTOR-26', qty: 1 },
        { partCode: 'PART-PEDAL-SET',        qty: 1 },
        { partCode: 'PART-CHAIN',            qty: 1 },
        { partCode: 'PART-RD-UNIT',          qty: 1 },
        { partCode: 'PART-RD-HANGER',        qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-08', [
        { partCode: 'PART-BRAKE-SET',      qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-09', [
        { partCode: 'ASSY-HANDLEBAR-VC',   qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-10', [
        { partCode: 'PART-KICKSTAND',      qty: 1 },
      ]);
    }

    // ECO full-assembly
    for (const rc of ecoRoutings) {
      addRsm(rc, 'ST-MAIN-01', [
        { partCode: 'PART-FRAME-EF',       qty: 1 },
        { partCode: 'PART-FORK-20',        qty: 1 },
        { partCode: 'PART-HEADSET',        qty: 1 },
        { partCode: 'PART-SEATPOST',       qty: 1 },
        { partCode: 'PART-SEAT-CLAMP',     qty: 1 },
        { partCode: 'PART-SADDLE',         qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-02', [
        { partCode: 'PART-BATT-36V',       qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-03', [
        { partCode: 'PART-WIRING-HARNESS', qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-04', [
        { partCode: 'PART-CONTROLLER-36V', qty: 1 },
        { partCode: 'PART-DISPLAY-LCD',    qty: 1 },
        { partCode: 'PART-THROTTLE',       qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-07', [
        { partCode: 'ASSY-WHEEL-F-20',       qty: 1 },
        { partCode: 'ASSY-WHEEL-R-MOTOR-20', qty: 1 },
        { partCode: 'PART-PEDAL-SET',        qty: 1 },
        { partCode: 'PART-CHAIN',            qty: 1 },
        { partCode: 'PART-RD-UNIT',          qty: 1 },
        { partCode: 'PART-RD-HANGER',        qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-08', [
        { partCode: 'PART-BRAKE-SET',      qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-09', [
        { partCode: 'ASSY-HANDLEBAR-VC',   qty: 1 },
      ]);
      addRsm(rc, 'ST-MAIN-10', [
        { partCode: 'PART-KICKSTAND',      qty: 1 },
      ]);
    }

    // Sub-routing: Wheel Front 26
    addRsm('ROUTE-WHL-F-26', 'ST-MAIN-07', [
      { partCode: 'PART-TIRE-26',  qty: 1  },
      { partCode: 'PART-RIM-26',   qty: 1  },
      { partCode: 'PART-SPOKE-SS', qty: 36 },
      { partCode: 'ASSY-HUB-F',   qty: 1  },
      { partCode: 'PART-NUT-M12',  qty: 2  },
    ]);

    // Sub-routing: Wheel Front 20
    addRsm('ROUTE-WHL-F-20', 'ST-MAIN-07', [
      { partCode: 'PART-TIRE-20',  qty: 1  },
      { partCode: 'PART-RIM-20',   qty: 1  },
      { partCode: 'PART-SPOKE-SS', qty: 36 },
      { partCode: 'ASSY-HUB-F',   qty: 1  },
      { partCode: 'PART-NUT-M12',  qty: 2  },
    ]);

    // Sub-routing: Wheel Rear Motor 26
    addRsm('ROUTE-WHL-R-26', 'ST-MAIN-05', [
      { partCode: 'ASSY-MOTOR-HUB-48V', qty: 1 },
    ]);
    addRsm('ROUTE-WHL-R-26', 'ST-MAIN-07', [
      { partCode: 'PART-TIRE-26',   qty: 1  },
      { partCode: 'PART-RIM-26',    qty: 1  },
      { partCode: 'PART-SPOKE-SS',  qty: 36 },
      { partCode: 'PART-FREEWHEEL', qty: 1  },
      { partCode: 'PART-NUT-M12',   qty: 2  },
    ]);

    // Sub-routing: Wheel Rear Motor 20
    addRsm('ROUTE-WHL-R-20', 'ST-MAIN-05', [
      { partCode: 'ASSY-MOTOR-HUB-36V', qty: 1 },
    ]);
    addRsm('ROUTE-WHL-R-20', 'ST-MAIN-07', [
      { partCode: 'PART-TIRE-20',   qty: 1  },
      { partCode: 'PART-RIM-20',    qty: 1  },
      { partCode: 'PART-SPOKE-SS',  qty: 36 },
      { partCode: 'PART-FREEWHEEL', qty: 1  },
      { partCode: 'PART-NUT-M12',   qty: 2  },
    ]);

    // Sub-routing: Handlebar
    addRsm('ROUTE-HNDLBR-VC', 'ST-MAIN-09', [
      { partCode: 'PART-STEM',        qty: 1 },
      { partCode: 'PART-GRIP-RUBBER', qty: 2 },
    ]);

    // Sub-routing: Hub Front
    addRsm('ROUTE-HUB-F', 'ST-MAIN-07', [
      { partCode: 'PART-AXLE-F',      qty: 1 },
      { partCode: 'PART-BEARING-608', qty: 2 },
    ]);

    // Sub-routing: Motor Hub 48V
    addRsm('ROUTE-MTR-48V', 'ST-MAIN-05', [
      { partCode: 'PART-AXLE-R',      qty: 1 },
      { partCode: 'PART-BEARING-608', qty: 2 },
    ]);

    // Sub-routing: Motor Hub 36V
    addRsm('ROUTE-MTR-36V', 'ST-MAIN-05', [
      { partCode: 'PART-AXLE-R',      qty: 1 },
      { partCode: 'PART-BEARING-608', qty: 2 },
    ]);

    // Sub-routing: Frame VC
    addRsm('ROUTE-FRM-VC', 'ST-MAIN-01', [
      { partCode: 'PART-FRAME-VC', qty: 1 },
    ]);

    // Sub-routing: Frame EF
    addRsm('ROUTE-FRM-EF', 'ST-MAIN-01', [
      { partCode: 'PART-FRAME-EF', qty: 1 },
    ]);

    // Sub-routing: Battery 48V
    addRsm('ROUTE-BATT-48V', 'ST-MAIN-02', [
      { partCode: 'PART-BATT-CASE',  qty: 1  },
      { partCode: 'PART-BMS-48V',    qty: 1  },
      { partCode: 'PART-CELL-18650', qty: 52 },
    ]);

    // Sub-routing: Battery 36V
    addRsm('ROUTE-BATT-36V', 'ST-MAIN-02', [
      { partCode: 'PART-BATT-CASE',  qty: 1  },
      { partCode: 'PART-BMS-36V',    qty: 1  },
      { partCode: 'PART-CELL-18650', qty: 40 },
    ]);

    // Resolve IDs dan build final rows
    const rsmRows = [];
    for (const entry of rsmEntries) {
      const routingId = await getRoutingId(entry.routingCode);
      const stationId = stIds[entry.stationCode];
      if (!stationId) throw new Error(`Station not cached: ${entry.stationCode}`);
      const part = getPart(entry.partCode);

      rsmRows.push({
        routing_id:   routingId,
        station_id:   stationId,
        part_id:      part.id,
        qty_per_unit: entry.qty,
        uom:          'PCS',
        created_at:   now,
        updated_at:   now,
      });
    }

    await queryInterface.bulkInsert('s_routing_station_materials', rsmRows);
    console.log(`[STEP 11] Done. ${rsmRows.length} RSM rows inserted.`);

    console.log('[DONE] All seeder steps completed successfully.');
  },

  // =========================================================
  // DOWN — rollback semua yang dibuat seeder ini
  // =========================================================
  async down(queryInterface) {
    console.log('[DOWN] Rolling back combined seeder...');

    await queryInterface.sequelize.query(`DELETE FROM s_routing_station_materials`);
    await queryInterface.sequelize.query(`DELETE FROM s_part_routing_details`);
    await queryInterface.sequelize.query(`DELETE FROM s_part_routings`);
    await queryInterface.sequelize.query(`DELETE FROM s_bom_details`);
    await queryInterface.sequelize.query(`DELETE FROM s_boms`);
    await queryInterface.sequelize.query(`
      DELETE FROM s_shift_calendars
      WHERE line_id = (SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN')
    `);
    await queryInterface.sequelize.query(`
      DELETE FROM s_line_capacity_params
      WHERE line_id = (SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN')
    `);
    await queryInterface.sequelize.query(`
      DELETE FROM s_station_jobs
      WHERE station_id IN (
        SELECT id FROM s_stations
        WHERE line_id = (SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN')
      )
    `);
    await queryInterface.sequelize.query(`
      DELETE FROM s_stations
      WHERE line_id = (SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN')
    `);
    await queryInterface.bulkDelete('s_lines', { line_code: 'ASSY-MAIN' }, {});

    console.log('[DOWN] Rollback complete.');
  },
};