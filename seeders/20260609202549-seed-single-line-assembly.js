'use strict';

/** @param {import('sequelize').QueryInterface} queryInterface */
async function getLineId(queryInterface) {
  const [results] = await queryInterface.sequelize.query(
    `SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN' LIMIT 1`
  );
  return results[0].id;
}

/** @param {import('sequelize').QueryInterface} queryInterface */
async function getStationId(queryInterface, stationCode) {
  const [results] = await queryInterface.sequelize.query(
    `SELECT id FROM s_stations WHERE station_code = $1 LIMIT 1`,
    { bind: [stationCode] }
  );
  return results[0].id;
}

/** @param {import('sequelize').QueryInterface} queryInterface */
async function getRoutingId(queryInterface, routingCode) {
  const [results] = await queryInterface.sequelize.query(
    `SELECT id FROM s_part_routings WHERE routing_code = $1 LIMIT 1`,
    { bind: [routingCode] }
  );
  return results[0].id;
}

function getMonthRange(year, month) {
  const pad   = (n) => String(n).padStart(2, '0');
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0); // hari terakhir bulan ini
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

/**
 * Versi raw-SQL dari LineCapacityModule#resolveShiftCalendarParams.
 * Mengambil shift calendar yang overlap dengan [startDate, endDate] untuk
 * sebuah line, lalu menurunkan working_days, shifts_per_day,
 * working_hours_per_shift, dan overtime_hours — persis logika di module.
 */
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

  // Expand ke per-hari, diklem dalam [startDate, endDate]
  const dayMap = new Map(); // dateStr → { is_holiday, regularShifts[], overtimeShifts[] }

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
      day.is_holiday = cal.is_holiday; // entry terbaru menang jika konflik

      if (cal.type === 'REGULAR') {
        day.regularShifts.push(cal);
      } else if (cal.type === 'NON REGULAR') {
        day.overtimeShifts.push(cal);
      }
    }
  }

  // Pisahkan hari kerja vs hari overtime
  const workingDays  = [];
  const overtimeDays = [];

  for (const [, day] of dayMap) {
    if (!day.is_holiday) workingDays.push(day);
    else overtimeDays.push(day);
  }

  if (workingDays.length === 0) return null;

  // working_days
  const working_days = workingDays.length;

  // shifts_per_day
  const shiftsPerDayArr = workingDays.map((day) => {
    const uniqueNums = new Set(day.regularShifts.map((s) => s.shift_number));
    return uniqueNums.size;
  });
  const shifts_per_day = Math.round(
    shiftsPerDayArr.reduce((a, b) => a + b, 0) / shiftsPerDayArr.length
  );

  // working_hours_per_shift
  const netMinutesPerWorkingDay = workingDays.map((day) => calcNetMinutes(day.regularShifts));
  const avgNetMinutesPerDay =
    netMinutesPerWorkingDay.reduce((a, b) => a + b, 0) / netMinutesPerWorkingDay.length;
  const working_hours_per_shift =
    shifts_per_day > 0
      ? parseFloat((avgNetMinutesPerDay / 60 / shifts_per_day).toFixed(2))
      : 0;

  // overtime_hours
  const netMinutesPerOvertimeDay = overtimeDays.map((day) => calcNetMinutes(day.overtimeShifts));
  const avgOvertimeMinutesPerDay =
    netMinutesPerOvertimeDay.length > 0
      ? netMinutesPerOvertimeDay.reduce((a, b) => a + b, 0) / netMinutesPerOvertimeDay.length
      : 0;
  const overtime_hours = parseFloat((avgOvertimeMinutesPerDay / 60).toFixed(2));

  return { working_days, shifts_per_day, working_hours_per_shift, overtime_hours };
}

/**
 * Versi raw-SQL dari LineCapacityModule#_getLineSummary, hanya bagian yang
 * dibutuhkan di seeder: max_takt_time_seconds = takt time station tertinggi
 * (sum standard_time semua job aktif dalam station tersebut), dihitung dari
 * s_stations + s_station_jobs + s_jobs yang sudah di-insert di langkah 3 & 4.
 */
async function getMaxTaktTimeSeeder(queryInterface, lineId) {
  const [rows] = await queryInterface.sequelize.query(
    `
      SELECT sj.station_id AS station_id, SUM(j.standard_time) AS takt_time
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

export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // 1. Hapus routing lama (PPC scope)
    await queryInterface.bulkDelete('s_part_routing_details', null, {});
    await queryInterface.bulkDelete('s_part_routings', null, {});

    // 2. Buat line ASSY-MAIN
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

    const lineId = await getLineId(queryInterface);

    // 3. Buat 15 station (station_type_id: 1=Inspection, 2=Assembly, 3=Testing, 6=Packing/Handling)
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

    // 4. Station jobs (job_id merujuk ke s_jobs yang sudah ada di DB)
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
        { job_id: 63, sequence: 10 },  // ← BOTTLENECK
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
      const stationId = await getStationId(queryInterface, stationCode);
      for (const { job_id, sequence } of jobs) {
        stationJobsRows.push({ station_id: stationId, job_id, sequence, mandatory: true, active: true, created_at: now, updated_at: now });
      }
    }
    await queryInterface.bulkInsert('s_station_jobs', stationJobsRows);

    // 5. Copy shift calendars working days dari line_id=1 ke ASSY-MAIN
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

    // 6. Line capacity params — DIHITUNG, bukan hardcode.
    //    working_days / shifts_per_day / working_hours_per_shift / overtime_hours
    //    diturunkan dari s_shift_calendars (resolveShiftCalendarParamsSeeder,
    //    sama persis dengan logika resolveShiftCalendarParams di LineCapacityModule).
    //    default_max_takt_time diturunkan dari station dengan total standard_time
    //    job tertinggi (sama dengan _getLineSummary().max_takt_time_seconds di module).
    //    efficiency_factor & manpower tetap input eksplisit, sesuai kontrak module
    //    (manpower wajib diisi user / caller, tidak diderivasi otomatis).
    const DEFAULT_EFFICIENCY_FACTOR = 0.85;
    const DEFAULT_MANPOWER          = 20;

    const periodsToCalculate = [
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ];

    const maxTaktTime = await getMaxTaktTimeSeeder(queryInterface, lineId);

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
        line_id:                          lineId,
        default_working_days:             calendarParams.working_days,
        default_shifts_per_day:           calendarParams.shifts_per_day,
        default_working_hours_per_shift:  calendarParams.working_hours_per_shift,
        default_efficiency_factor:        DEFAULT_EFFICIENCY_FACTOR,
        default_overtime_hours:           calendarParams.overtime_hours,
        default_manpower:                 DEFAULT_MANPOWER,
        default_max_takt_time:            maxTaktTime,
        param_year:                       year,
        param_month:                      month,
        created_at:                       now,
        updated_at:                       now,
      });
    }

    await queryInterface.bulkInsert('s_line_capacity_params', capacityParamRows);

    // 7. Routing headers — 24 part diarahkan ke ASSY-MAIN
    await queryInterface.bulkInsert('s_part_routings', [
      { routing_code: 'ROUTE-VOLT-STD-1', part_id: 1,  line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly VOLT STALLION BLACK GEN 2025', created_at: now, updated_at: now },
      { routing_code: 'ROUTE-VOLT-STD-2', part_id: 2,  line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly VOLT ARMOR GREY GEN 2025',     created_at: now, updated_at: now },
      { routing_code: 'ROUTE-VOLT-STD-3', part_id: 3,  line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly VOLT ROYAL WHITE GEN 2025',    created_at: now, updated_at: now },
      { routing_code: 'ROUTE-VOLT-STD-4', part_id: 4,  line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly VOLT STALLION BLACK GEN 2026', created_at: now, updated_at: now },
      { routing_code: 'ROUTE-VOLT-STD-5', part_id: 5,  line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly VOLT ARMOR GREY GEN 2026',     created_at: now, updated_at: now },
      { routing_code: 'ROUTE-VOLT-STD-6', part_id: 6,  line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly VOLT ROYAL WHITE GEN 2026',    created_at: now, updated_at: now },
      { routing_code: 'ROUTE-ECO-STD-1',  part_id: 7,  line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly ECO STALLION BLACK GEN 2025',  created_at: now, updated_at: now },
      { routing_code: 'ROUTE-ECO-STD-2',  part_id: 8,  line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly ECO ARMOR GREY GEN 2025',      created_at: now, updated_at: now },
      { routing_code: 'ROUTE-ECO-STD-3',  part_id: 9,  line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly ECO ROYAL WHITE GEN 2025',     created_at: now, updated_at: now },
      { routing_code: 'ROUTE-ECO-STD-4',  part_id: 10, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly ECO STALLION BLACK GEN 2026',  created_at: now, updated_at: now },
      { routing_code: 'ROUTE-ECO-STD-5',  part_id: 11, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly ECO ARMOR GREY GEN 2026',      created_at: now, updated_at: now },
      { routing_code: 'ROUTE-ECO-STD-6',  part_id: 12, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Assembly ECO ROYAL WHITE GEN 2026',     created_at: now, updated_at: now },
      { routing_code: 'ROUTE-WHL-F-26',   part_id: 13, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Front Wheel Assy 26 Inch (Volt)',        created_at: now, updated_at: now },
      { routing_code: 'ROUTE-WHL-F-20',   part_id: 14, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Front Wheel Assy 20 Inch (Eco)',         created_at: now, updated_at: now },
      { routing_code: 'ROUTE-WHL-R-26',   part_id: 15, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Rear Motor Wheel Assy 26" 350W (Volt)',  created_at: now, updated_at: now },
      { routing_code: 'ROUTE-WHL-R-20',   part_id: 16, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Rear Motor Wheel Assy 20" 250W (Eco)',   created_at: now, updated_at: now },
      { routing_code: 'ROUTE-HNDLBR-VC',  part_id: 17, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Handlebar Set VoltCity',                 created_at: now, updated_at: now },
      { routing_code: 'ROUTE-HUB-F',      part_id: 18, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Front Hub System Assembly',              created_at: now, updated_at: now },
      { routing_code: 'ROUTE-MTR-48V',    part_id: 19, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Hub Motor 48V Sub-Assy (Volt)',          created_at: now, updated_at: now },
      { routing_code: 'ROUTE-MTR-36V',    part_id: 20, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Hub Motor 36V Sub-Assy (Eco)',           created_at: now, updated_at: now },
      { routing_code: 'ROUTE-FRM-VC',     part_id: 21, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Main Frame VoltCity Unpainted',          created_at: now, updated_at: now },
      { routing_code: 'ROUTE-FRM-EF',     part_id: 22, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Main Frame EcoFold Unpainted',           created_at: now, updated_at: now },
      { routing_code: 'ROUTE-BATT-48V',   part_id: 25, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Lithium Battery Pack 48V 15Ah (Volt)',  created_at: now, updated_at: now },
      { routing_code: 'ROUTE-BATT-36V',   part_id: 26, line_id: lineId, version: 1, is_default: true, active: true, description: 'Routing Lithium Battery Pack 36V 10Ah (Eco)',   created_at: now, updated_at: now },
    ]);

    // 8. Routing details
    const stIds = {};
    for (let i = 1; i <= 15; i++) {
      const code = `ST-MAIN-${String(i).padStart(2, '0')}`;
      stIds[code] = await getStationId(queryInterface, code);
    }

    const voltAssySteps = [
      [10,  'ST-MAIN-01', 1,   120,  0,   5,  1],
      [20,  'ST-MAIN-01', 2,   240,  0,   5,  1],
      [30,  'ST-MAIN-01', 3,   300,  30,  5,  1],
      [40,  'ST-MAIN-01', 4,   360,  30,  5,  2],
      [50,  'ST-MAIN-01', 5,   180,  0,   10, 1],
      [60,  'ST-MAIN-02', 56,  180,  0,   5,  1],
      [70,  'ST-MAIN-02', 58,  600,  0,   5,  2],
      [80,  'ST-MAIN-03', 6,   360,  30,  5,  2],
      [90,  'ST-MAIN-04', 7,   300,  30,  5,  1],
      [100, 'ST-MAIN-05', 8,   420,  30,  5,  2],
      [110, 'ST-MAIN-06', 9,   360,  30,  5,  1],
      [120, 'ST-MAIN-07', 38,  240,  30,  5,  2],
      [130, 'ST-MAIN-08', 39,  240,  30,  5,  1],
      [140, 'ST-MAIN-09', 41,  180,  30,  5,  1],
      [150, 'ST-MAIN-10', 43,  180,  0,   5,  1],
      [160, 'ST-MAIN-11', 10,  300,  0,   5,  1],
      [170, 'ST-MAIN-12', 63, 1200,  0,   10, 2],
      [180, 'ST-MAIN-13', 44,  180,  0,   5,  1],
      [190, 'ST-MAIN-13', 48,  180,  0,   5,  1],
      [200, 'ST-MAIN-14', 52,  240,  0,   5,  1],
      [210, 'ST-MAIN-14', 53,  120,  0,   5,  1],
      [220, 'ST-MAIN-15', 54,  120,  0,   0,  1],
    ];

    const ecoAssySteps = [
      [10,  'ST-MAIN-01', 1,   120,  0,   5,  1],
      [20,  'ST-MAIN-01', 2,   180,  0,   5,  1],
      [30,  'ST-MAIN-01', 3,   240,  30,  5,  1],
      [40,  'ST-MAIN-01', 4,   300,  30,  5,  1],
      [50,  'ST-MAIN-01', 5,   180,  0,   10, 1],
      [60,  'ST-MAIN-02', 56,  150,  0,   5,  1],
      [70,  'ST-MAIN-02', 58,  420,  0,   5,  2],
      [80,  'ST-MAIN-03', 6,   300,  30,  5,  1],
      [90,  'ST-MAIN-04', 7,   240,  30,  5,  1],
      [100, 'ST-MAIN-05', 8,   360,  30,  5,  1],
      [110, 'ST-MAIN-06', 9,   300,  30,  5,  1],
      [120, 'ST-MAIN-07', 38,  210,  30,  5,  2],
      [130, 'ST-MAIN-08', 39,  210,  30,  5,  1],
      [140, 'ST-MAIN-09', 41,  180,  30,  5,  1],
      [150, 'ST-MAIN-10', 43,  150,  0,   5,  1],
      [160, 'ST-MAIN-11', 10,  240,  0,   5,  1],
      [170, 'ST-MAIN-12', 63,  900,  0,   10, 2],
      [180, 'ST-MAIN-13', 44,  180,  0,   5,  1],
      [190, 'ST-MAIN-13', 48,  150,  0,   5,  1],
      [200, 'ST-MAIN-14', 52,  180,  0,   5,  1],
      [210, 'ST-MAIN-14', 53,  120,  0,   5,  1],
      [220, 'ST-MAIN-15', 54,  120,  0,   0,  1],
    ];

    const wheelSteps = [
      [10, 'ST-MAIN-07', 38, 240, 30, 5, 2],
      [20, 'ST-MAIN-07', 40, 180, 0,  5, 1],
    ];
    const wheelRoutings = ['ROUTE-WHL-F-26', 'ROUTE-WHL-F-20', 'ROUTE-WHL-R-26', 'ROUTE-WHL-R-20'];

    const handlebarSteps = [
      [10, 'ST-MAIN-09', 41, 180, 30, 5, 1],
      [20, 'ST-MAIN-09', 42, 120, 0,  5, 1],
    ];

    const hubSteps = [
      [10, 'ST-MAIN-07', 38, 240, 30, 5, 2, true],
    ];

    const motorVoltSteps = [
      [10, 'ST-MAIN-05', 8,  420, 30, 5, 2],
      [20, 'ST-MAIN-05', 35, 150, 0,  5, 1],
    ];
    const motorEcoSteps = [
      [10, 'ST-MAIN-05', 8,  360, 30, 5, 1],
      [20, 'ST-MAIN-05', 35, 120, 0,  5, 1],
    ];

    const frameVoltSteps = [
      [10, 'ST-MAIN-01', 1, 120,  0,  5, 1],
      [20, 'ST-MAIN-01', 2, 240,  0,  5, 1],
      [30, 'ST-MAIN-01', 3, 300,  30, 5, 1],
      [40, 'ST-MAIN-01', 4, 360,  30, 5, 2],
      [50, 'ST-MAIN-01', 5, 180,  0,  5, 1],
    ];
    const frameEcoSteps = [
      [10, 'ST-MAIN-01', 1, 120,  0,  5, 1],
      [20, 'ST-MAIN-01', 2, 180,  0,  5, 1],
      [30, 'ST-MAIN-01', 3, 240,  30, 5, 1],
      [40, 'ST-MAIN-01', 4, 300,  30, 5, 1],
      [50, 'ST-MAIN-01', 5, 180,  0,  5, 1],
    ];

    const batteryVoltSteps = [
      [10, 'ST-MAIN-02', 56, 180, 0, 5,  1],
      [20, 'ST-MAIN-02', 57, 120, 0, 5,  1],
      [30, 'ST-MAIN-02', 58, 600, 0, 5,  2],
      [40, 'ST-MAIN-02', 59, 480, 0, 5,  2],
      [50, 'ST-MAIN-02', 60, 900, 0, 10, 0],
      [60, 'ST-MAIN-02', 62, 180, 0, 5,  1],
    ];
    const batteryEcoSteps = [
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
        const routingId = await getRoutingId(queryInterface, code);
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
      ...await buildDetailRows(voltAssySteps,   voltRoutings),
      ...await buildDetailRows(ecoAssySteps,    ecoRoutings),
      ...await buildDetailRows(wheelSteps,       wheelRoutings),
      ...await buildDetailRows(handlebarSteps,   ['ROUTE-HNDLBR-VC']),
      ...await buildDetailRows(hubSteps,         ['ROUTE-HUB-F']),
      ...await buildDetailRows(motorVoltSteps,   ['ROUTE-MTR-48V']),
      ...await buildDetailRows(motorEcoSteps,    ['ROUTE-MTR-36V']),
      ...await buildDetailRows(frameVoltSteps,   ['ROUTE-FRM-VC']),
      ...await buildDetailRows(frameEcoSteps,    ['ROUTE-FRM-EF']),
      ...await buildDetailRows(batteryVoltSteps, ['ROUTE-BATT-48V']),
      ...await buildDetailRows(batteryEcoSteps,  ['ROUTE-BATT-36V']),
    ];

    await queryInterface.bulkInsert('s_part_routing_details', allDetailRows);
  },

  // DOWN — hapus semua yang dibuat seeder ini; line lama tidak dikembalikan
  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_part_routing_details', null, {});
    await queryInterface.bulkDelete('s_part_routings', null, {});

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
      WHERE station_id IN (SELECT id FROM s_stations WHERE line_id = (SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN'))
    `);
    await queryInterface.sequelize.query(`
      DELETE FROM s_stations
      WHERE line_id = (SELECT id FROM s_lines WHERE line_code = 'ASSY-MAIN')
    `);

    await queryInterface.bulkDelete('s_lines', { line_code: 'ASSY-MAIN' }, {});
  },
};