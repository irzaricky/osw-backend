'use strict';

/**
 * SEEDER 1 — Line Infrastructure
 *
 * STEP 0 — Bersihkan data lama
 * STEP 1 — Line ASSY-MAIN
 * STEP 2 — Stations (15 station)
 * STEP 3 — Station Jobs
 * STEP 4 — Shift Calendars (copy dari line_id=1)
 * STEP 5 — Line Capacity Params
 */

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

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

async function resolveShiftCalendarParams(queryInterface, lineId, startDate, endDate) {
  const [calendars] = await queryInterface.sequelize.query(
    `
      SELECT
        sc.start_date,
        sc.end_date,
        rtc.is_holiday  AS is_holiday,
        sh.shift_number AS shift_number,
        sh.type         AS type,
        sh.start_time   AS start_time,
        sh.end_time     AS end_time,
        sh.category     AS category
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
  const dayMap     = new Map();

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
      if (cal.type === 'REGULAR')          day.regularShifts.push(cal);
      else if (cal.type === 'NON REGULAR') day.overtimeShifts.push(cal);
    }
  }

  const workingDays  = [];
  const overtimeDays = [];
  for (const [, day] of dayMap) {
    if (!day.is_holiday) workingDays.push(day);
    else                 overtimeDays.push(day);
  }

  if (workingDays.length === 0) return null;

  const working_days    = workingDays.length;
  const shiftsPerDayArr = workingDays.map(
    (day) => new Set(day.regularShifts.map((s) => s.shift_number)).size
  );
  const shifts_per_day  = Math.round(
    shiftsPerDayArr.reduce((a, b) => a + b, 0) / shiftsPerDayArr.length
  );
  const netMinutesArr   = workingDays.map((day) => calcNetMinutes(day.regularShifts));
  const avgNetMinutes   = netMinutesArr.reduce((a, b) => a + b, 0) / netMinutesArr.length;
  const working_hours_per_shift = shifts_per_day > 0
    ? parseFloat((avgNetMinutes / 60 / shifts_per_day).toFixed(2))
    : 0;
  const netOvertimeArr     = overtimeDays.map((day) => calcNetMinutes(day.overtimeShifts));
  const avgOvertimeMinutes = netOvertimeArr.length > 0
    ? netOvertimeArr.reduce((a, b) => a + b, 0) / netOvertimeArr.length
    : 0;
  const overtime_hours = parseFloat((avgOvertimeMinutes / 60).toFixed(2));

  return { working_days, shifts_per_day, working_hours_per_shift, overtime_hours };
}

async function getMaxTaktTime(queryInterface, lineId) {
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

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export default {
  async up(queryInterface) {
    const now = new Date();
    const q   = (sql, bind) =>
      queryInterface.sequelize.query(sql, bind ? { bind } : undefined);

    const getId = async (table, col, val) => {
      const [[row]] = await q(`SELECT id FROM ${table} WHERE ${col} = $1 LIMIT 1`, [val]);
      if (!row) throw new Error(`Not found in ${table} where ${col}='${val}'`);
      return row.id;
    };
    const getStationId = (code) => getId('s_stations', 'station_code', code);

    // ── STEP 0: Bersihkan data lama ────────────────────────────────────────
    console.log('[STEP 0] Clearing old data...');
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

    // ── STEP 1: Line ASSY-MAIN ─────────────────────────────────────────────
    console.log('[STEP 1] Creating line ASSY-MAIN...');
    await queryInterface.bulkInsert('s_lines', [{
      line_code:  'ASSY-MAIN',
      name:       'Line Assembly E-Bike (Main)',
      factory_id: 1,
      sequence:   5,
      is_active:  true,
      created_at: now,
      updated_at: now,
    }]);
    const lineId = await getId('s_lines', 'line_code', 'ASSY-MAIN');
    console.log(`[STEP 1] Done. lineId=${lineId}`);

    // ── STEP 2: Stations ───────────────────────────────────────────────────
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

    const stIds = {};
    for (let i = 1; i <= 15; i++) {
      const code = `ST-MAIN-${String(i).padStart(2, '0')}`;
      stIds[code] = await getStationId(code);
    }
    console.log('[STEP 2] Done.');

    // ── STEP 3: Station Jobs ───────────────────────────────────────────────
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

    const stationJobRows = [];
    for (const [stationCode, jobs] of Object.entries(stationJobsMap)) {
      for (const { job_id, sequence } of jobs) {
        stationJobRows.push({
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
    await queryInterface.bulkInsert('s_station_jobs', stationJobRows);
    console.log(`[STEP 3] Done. ${stationJobRows.length} rows inserted.`);

    // ── STEP 4: Shift Calendars (copy dari line_id=1) ──────────────────────
    console.log('[STEP 4] Copying shift calendars...');
    const [calendarRows] = await queryInterface.sequelize.query(`
      SELECT sc.shift_id, sc.start_date, sc.end_date, sc.ref_type_calendar_id, sc.date_event
      FROM   s_shift_calendars sc
      JOIN   ref_type_calendars rtc ON rtc.id = sc.ref_type_calendar_id
      WHERE  sc.line_id     = 1
        AND  rtc.is_holiday = false
        AND  sc.start_date >= '2026-05-01'
        AND  sc.start_date <= '2026-07-31'
        AND  sc.deleted_at  IS NULL
    `);

    if (calendarRows.length > 0) {
      await queryInterface.bulkInsert('s_shift_calendars',
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
    console.log(`[STEP 4] Done. ${calendarRows.length} rows copied.`);

    // ── STEP 5: Line Capacity Params ───────────────────────────────────────
    console.log('[STEP 5] Calculating line capacity params...');
    const DEFAULT_EFFICIENCY_FACTOR = 0.85;
    const DEFAULT_MANPOWER          = 20;
    const periods = [
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ];

    const maxTaktTime       = await getMaxTaktTime(queryInterface, lineId);
    const capacityParamRows = [];

    for (const { year, month } of periods) {
      const { startDate, endDate } = getMonthRange(year, month);
      const params = await resolveShiftCalendarParams(queryInterface, lineId, startDate, endDate);

      if (!params) {
        throw new Error(
          `Shift calendar tidak ditemukan untuk line ASSY-MAIN periode ` +
          `${year}-${String(month).padStart(2, '0')}. ` +
          `Pastikan source line_id=1 punya shift calendar pada periode tersebut.`
        );
      }

      capacityParamRows.push({
        line_id:                         lineId,
        default_working_days:            params.working_days,
        default_shifts_per_day:          params.shifts_per_day,
        default_working_hours_per_shift: params.working_hours_per_shift,
        default_efficiency_factor:       DEFAULT_EFFICIENCY_FACTOR,
        default_overtime_hours:          params.overtime_hours,
        default_manpower:                DEFAULT_MANPOWER,
        default_max_takt_time:           maxTaktTime,
        param_year:                      year,
        param_month:                     month,
        created_at:                      now,
        updated_at:                      now,
      });
    }

    await queryInterface.bulkInsert('s_line_capacity_params', capacityParamRows);
    console.log(`[STEP 5] Done. ${capacityParamRows.length} rows inserted.`);
    console.log('[DONE] Seeder 1 completed.');
  },

  async down(queryInterface) {
    console.log('[DOWN] Rolling back seeder 1...');
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
    console.log('[DOWN] Done.');
  },
};