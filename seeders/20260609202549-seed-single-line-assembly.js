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
        { job_id: 1,  sequence: 10 },  // JOB-INSP-DIM  : Check Frame Dimension
        { job_id: 2,  sequence: 20 },  // JOB-INSP-WELD : Welding Joint Inspection
        { job_id: 3,  sequence: 30 },  // JOB-ALIGN-FRM : Frame Alignment Setting
        { job_id: 4,  sequence: 40 },  // JOB-INST-BRKT : Install Frame Bracket
        { job_id: 5,  sequence: 50 },  // JOB-QC-FRM    : Final Frame QC
      ],
      'ST-MAIN-02': [
        { job_id: 56, sequence: 10 },  // JOB-BATT-INSP  : Cell Visual Inspection
        { job_id: 57, sequence: 20 },  // JOB-BATT-VOLT  : Cell Voltage Check
        { job_id: 58, sequence: 30 },  // JOB-BATT-BUILD : Build Battery Pack
        { job_id: 59, sequence: 40 },  // JOB-BATT-WELD  : Spot Weld Cell Tabs
        { job_id: 60, sequence: 50 },  // JOB-BATT-CHG   : Initial Charge Cycle
        { job_id: 62, sequence: 60 },  // JOB-BATT-FQC   : Battery Final QC Check
      ],
      'ST-MAIN-03': [
        { job_id: 6,  sequence: 10 },  // JOB-INST-WIRE : Install Wiring Harness
        { job_id: 33, sequence: 20 },  // JOB-RT-WIRE   : Route & Clamp Wiring
      ],
      'ST-MAIN-04': [
        { job_id: 7,  sequence: 10 },  // JOB-INST-CTRL : Install Controller Unit
        { job_id: 34, sequence: 20 },  // JOB-CN-CTRL   : Connect Controller Wiring
      ],
      'ST-MAIN-05': [
        { job_id: 8,  sequence: 10 },  // JOB-INST-MOTOR : Install Motor Hub
        { job_id: 35, sequence: 20 },  // JOB-CN-MTR     : Motor Wiring Connection
      ],
      'ST-MAIN-06': [
        { job_id: 9,  sequence: 10 },  // JOB-INST-BATT : Install Battery Pack to Frame
        { job_id: 36, sequence: 20 },  // JOB-SEC-BATT  : Secure Battery Lock
      ],
      'ST-MAIN-07': [
        { job_id: 38, sequence: 10 },  // JOB-INST-WHL : Install Front & Rear Wheel
        { job_id: 40, sequence: 20 },  // JOB-ADJ-BRK  : Brake Adjustment (post-wheel)
      ],
      'ST-MAIN-08': [
        { job_id: 39, sequence: 10 },  // JOB-INST-BRK : Install Brake Cables & Levers
        { job_id: 40, sequence: 20 },  // JOB-ADJ-BRK  : Brake Adjustment
      ],
      'ST-MAIN-09': [
        { job_id: 41, sequence: 10 },  // JOB-INST-HND : Install Handlebar
        { job_id: 42, sequence: 20 },  // JOB-ALN-HND  : Handlebar Alignment
      ],
      'ST-MAIN-10': [
        { job_id: 43, sequence: 10 },  // JOB-INST-ACC : Install Lamp & Accessories
      ],
      'ST-MAIN-11': [
        { job_id: 10, sequence: 10 },  // JOB-TEST-ELEC : Electrical Functional Test
        { job_id: 37, sequence: 20 },  // JOB-ERR-CODE  : Error Code Verification
      ],
      'ST-MAIN-12': [
        { job_id: 63, sequence: 10 },  // JOB-TST-FULLCHG : Full Charge Test ← BOTTLENECK
        { job_id: 65, sequence: 20 },  // JOB-TST-ELEC-SF : Electrical Safety Verify
        { job_id: 66, sequence: 30 },  // JOB-TST-SPEED   : Speed Performance Test
      ],
      'ST-MAIN-13': [
        { job_id: 44, sequence: 10 },  // JOB-CHK-ASSY : Overall Assembly Check
        { job_id: 45, sequence: 20 },  // JOB-CHK-TRQ  : Torque Final Check
        { job_id: 48, sequence: 30 },  // JOB-VIS-FIN  : Final Visual Inspection
        { job_id: 49, sequence: 40 },  // JOB-APP-FUN  : Functional Approval
      ],
      'ST-MAIN-14': [
        { job_id: 50, sequence: 10 },  // JOB-CLN-UNIT : Cleaning Unit
        { job_id: 51, sequence: 20 },  // JOB-ATT-LBL  : Attach Manual & Label
        { job_id: 52, sequence: 30 },  // JOB-PCK-BOX  : Pack E-Bike into Carton
        { job_id: 53, sequence: 40 },  // JOB-SEAL-BOX : Seal & Strap Carton
      ],
      'ST-MAIN-15': [
        { job_id: 54, sequence: 10 },  // JOB-MOV-FG : Move to FG Area
        { job_id: 55, sequence: 20 },  // JOB-SCN-SN : Scan Serial Number
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

    // 5. Line capacity params — bottleneck ST-MAIN-12: VOLT=1200s, ECO=900s per unit
    await queryInterface.bulkInsert('s_line_capacity_params', [
      { line_id: lineId, default_working_days: 21, default_shifts_per_day: 1, default_working_hours_per_shift: 7.33, default_efficiency_factor: 0.85, default_overtime_hours: 0.00, default_manpower: 20, default_max_takt_time: 420, param_year: 2026, param_month: 5,  created_at: now, updated_at: now },
      { line_id: lineId, default_working_days: 22, default_shifts_per_day: 1, default_working_hours_per_shift: 7.33, default_efficiency_factor: 0.85, default_overtime_hours: 0.00, default_manpower: 20, default_max_takt_time: 420, param_year: 2026, param_month: 6,  created_at: now, updated_at: now },
      { line_id: lineId, default_working_days: 23, default_shifts_per_day: 1, default_working_hours_per_shift: 7.33, default_efficiency_factor: 0.85, default_overtime_hours: 0.00, default_manpower: 20, default_max_takt_time: 420, param_year: 2026, param_month: 7,  created_at: now, updated_at: now },
    ]);

    // 6. Copy shift calendars working days dari line_id=1 ke ASSY-MAIN
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
    // Format: [sequence, stationCode, jobId, stdTime(s), setupTime(s), moveTime(s), manpower, isBottleneck]
    //
    // Perbedaan VOLT vs ECO:
    //   ST-MAIN-01 Frame: ECO lebih ringan → Frame Alignment & Bracket lebih cepat
    //   ST-MAIN-02 Battery: ECO 36V 10Ah vs VOLT 48V 15Ah → Build & Weld lebih cepat, Initial Charge jauh lebih singkat
    //   ST-MAIN-05 Motor: ECO 250W vs VOLT 350W → instalasi sedikit lebih mudah
    //   ST-MAIN-06 Battery Mounting: ECO pack lebih ringan → lebih cepat
    //   ST-MAIN-12 Charging Test: ECO 900s vs VOLT 1200s (proporsional kapasitas baterai 10/15Ah)
    //   ST-MAIN-14 Packing: ECO frame lebih kecil → packing lebih cepat

    const stIds = {};
    for (let i = 1; i <= 15; i++) {
      const code = `ST-MAIN-${String(i).padStart(2, '0')}`;
      stIds[code] = await getStationId(queryInterface, code);
    }

    // --- 8A. VOLT full assembly (part 1–6) ---
    // Bottleneck: ST-MAIN-12, 1200s (Full Charge + Performance Test 48V 15Ah)
    const voltAssySteps = [
      [10,  'ST-MAIN-01', 1,   120,  0,   5,  1, false],  // Check Frame Dimension
      [20,  'ST-MAIN-01', 2,   240,  0,   5,  1, false],  // Welding Joint Inspection
      [30,  'ST-MAIN-01', 3,   300,  30,  5,  1, false],  // Frame Alignment Setting
      [40,  'ST-MAIN-01', 4,   360,  30,  5,  2, false],  // Install Frame Bracket
      [50,  'ST-MAIN-01', 5,   180,  0,   10, 1, false],  // Final Frame QC
      [60,  'ST-MAIN-02', 56,  180,  0,   5,  1, false],  // Cell Visual Inspection
      [70,  'ST-MAIN-02', 58,  600,  0,   5,  2, false],  // Build Battery Pack
      [80,  'ST-MAIN-03', 6,   360,  30,  5,  2, false],  // Install Wiring Harness
      [90,  'ST-MAIN-04', 7,   300,  30,  5,  1, false],  // Install Controller Unit
      [100, 'ST-MAIN-05', 8,   420,  30,  5,  2, false],  // Install Motor Hub (350W)
      [110, 'ST-MAIN-06', 9,   360,  30,  5,  1, false],  // Install Battery Pack to Frame
      [120, 'ST-MAIN-07', 38,  240,  30,  5,  2, false],  // Install Front & Rear Wheel
      [130, 'ST-MAIN-08', 39,  240,  30,  5,  1, false],  // Install Brake System
      [140, 'ST-MAIN-09', 41,  180,  30,  5,  1, false],  // Install Handlebar
      [150, 'ST-MAIN-10', 43,  180,  0,   5,  1, false],  // Install Lamp & Accessories
      [160, 'ST-MAIN-11', 10,  300,  0,   5,  1, false],  // Electrical Functional Test
      [170, 'ST-MAIN-12', 63, 1200,  0,   10, 2, true ],  // Full Charge + Perf Test 48V ← BOTTLENECK
      [180, 'ST-MAIN-13', 44,  180,  0,   5,  1, false],  // Overall Assembly Check
      [190, 'ST-MAIN-13', 48,  180,  0,   5,  1, false],  // Final Visual Inspection
      [200, 'ST-MAIN-14', 52,  240,  0,   5,  1, false],  // Pack E-Bike into Carton
      [210, 'ST-MAIN-14', 53,  120,  0,   5,  1, false],  // Seal & Strap Carton
      [220, 'ST-MAIN-15', 54,  120,  0,   0,  1, false],  // Move to FG Area
    ];

    // --- 8B. ECO full assembly (part 7–12) ---
    // Perbedaan vs VOLT: frame lebih ringan, baterai lebih kecil, motor 250W
    // Bottleneck: ST-MAIN-12, 900s (Full Charge + Performance Test 36V 10Ah)
    const ecoAssySteps = [
      [10,  'ST-MAIN-01', 1,   120,  0,   5,  1, false],  // Check Frame Dimension (sama)
      [20,  'ST-MAIN-01', 2,   180,  0,   5,  1, false],  // Welding Joint Inspection (frame lebih tipis, lebih cepat)
      [30,  'ST-MAIN-01', 3,   240,  30,  5,  1, false],  // Frame Alignment Setting (frame lebih ringan)
      [40,  'ST-MAIN-01', 4,   300,  30,  5,  1, false],  // Install Frame Bracket (lebih sedikit bracket)
      [50,  'ST-MAIN-01', 5,   180,  0,   10, 1, false],  // Final Frame QC (sama)
      [60,  'ST-MAIN-02', 56,  150,  0,   5,  1, false],  // Cell Visual Inspection (sel lebih sedikit)
      [70,  'ST-MAIN-02', 58,  420,  0,   5,  2, false],  // Build Battery Pack (36V 10Ah, lebih kecil)
      [80,  'ST-MAIN-03', 6,   300,  30,  5,  1, false],  // Install Wiring Harness (harness lebih ringkas)
      [90,  'ST-MAIN-04', 7,   240,  30,  5,  1, false],  // Install Controller Unit (36V controller lebih kecil)
      [100, 'ST-MAIN-05', 8,   360,  30,  5,  1, false],  // Install Motor Hub (250W, lebih ringan)
      [110, 'ST-MAIN-06', 9,   300,  30,  5,  1, false],  // Install Battery Pack (pack lebih kecil/ringan)
      [120, 'ST-MAIN-07', 38,  210,  30,  5,  2, false],  // Install Wheel (roda 20", lebih kecil)
      [130, 'ST-MAIN-08', 39,  210,  30,  5,  1, false],  // Install Brake System (sama minus satu kaliper)
      [140, 'ST-MAIN-09', 41,  180,  30,  5,  1, false],  // Install Handlebar (sama)
      [150, 'ST-MAIN-10', 43,  150,  0,   5,  1, false],  // Install Lamp & Accessories (lebih sedikit aksesori)
      [160, 'ST-MAIN-11', 10,  240,  0,   5,  1, false],  // Electrical Functional Test (sistem lebih simpel)
      [170, 'ST-MAIN-12', 63,  900,  0,   10, 2, true ],  // Full Charge + Perf Test 36V ← BOTTLENECK
      [180, 'ST-MAIN-13', 44,  180,  0,   5,  1, false],  // Overall Assembly Check (sama)
      [190, 'ST-MAIN-13', 48,  150,  0,   5,  1, false],  // Final Visual Inspection (unit lebih kecil)
      [200, 'ST-MAIN-14', 52,  180,  0,   5,  1, false],  // Pack E-Bike into Carton (box lebih kecil)
      [210, 'ST-MAIN-14', 53,  120,  0,   5,  1, false],  // Seal & Strap Carton (sama)
      [220, 'ST-MAIN-15', 54,  120,  0,   0,  1, false],  // Move to FG Area (sama)
    ];

    // --- 8C. Wheel sub-assembly ---
    const wheelSteps = [
      [10, 'ST-MAIN-07', 38, 240, 30, 5, 2, false],  // Install Front & Rear Wheel
      [20, 'ST-MAIN-07', 40, 180, 0,  5, 1, true ],  // Brake Adjustment ← bottleneck
    ];
    const wheelRoutings = ['ROUTE-WHL-F-26', 'ROUTE-WHL-F-20', 'ROUTE-WHL-R-26', 'ROUTE-WHL-R-20'];

    // --- 8D. Handlebar sub-assembly ---
    const handlebarSteps = [
      [10, 'ST-MAIN-09', 41, 180, 30, 5, 1, false],  // Install Handlebar
      [20, 'ST-MAIN-09', 42, 120, 0,  5, 1, true ],  // Handlebar Alignment ← bottleneck
    ];

    // --- 8E. Hub sub-assembly ---
    const hubSteps = [
      [10, 'ST-MAIN-07', 38, 240, 30, 5, 2, true],   // Install Front Hub ← bottleneck
    ];

    // --- 8F. Motor sub-assembly ---
    // VOLT 48V/350W lebih berat → instalasi lebih lama
    const motorVoltSteps = [
      [10, 'ST-MAIN-05', 8,  420, 30, 5, 2, false],  // Install Motor Hub 350W
      [20, 'ST-MAIN-05', 35, 150, 0,  5, 1, true ],  // Motor Wiring Connection ← bottleneck
    ];
    // ECO 36V/250W lebih ringan
    const motorEcoSteps = [
      [10, 'ST-MAIN-05', 8,  360, 30, 5, 1, false],  // Install Motor Hub 250W
      [20, 'ST-MAIN-05', 35, 120, 0,  5, 1, true ],  // Motor Wiring Connection ← bottleneck
    ];

    // --- 8G. Frame sub-assembly ---
    // VOLT frame lebih berat/kompleks (VoltCity) vs ECO (EcoFold foldable lebih ringan)
    const frameVoltSteps = [
      [10, 'ST-MAIN-01', 1, 120,  0,  5, 1, false],  // Check Frame Dimension
      [20, 'ST-MAIN-01', 2, 240,  0,  5, 1, false],  // Welding Joint Inspection
      [30, 'ST-MAIN-01', 3, 300,  30, 5, 1, false],  // Frame Alignment Setting
      [40, 'ST-MAIN-01', 4, 360,  30, 5, 2, false],  // Install Frame Bracket
      [50, 'ST-MAIN-01', 5, 180,  0,  5, 1, true ],  // Final Frame QC ← bottleneck
    ];
    const frameEcoSteps = [
      [10, 'ST-MAIN-01', 1, 120,  0,  5, 1, false],  // Check Frame Dimension
      [20, 'ST-MAIN-01', 2, 180,  0,  5, 1, false],  // Welding Joint Inspection
      [30, 'ST-MAIN-01', 3, 240,  30, 5, 1, false],  // Frame Alignment Setting
      [40, 'ST-MAIN-01', 4, 300,  30, 5, 1, false],  // Install Frame Bracket
      [50, 'ST-MAIN-01', 5, 180,  0,  5, 1, true ],  // Final Frame QC ← bottleneck
    ];

    // --- 8H. Battery pack sub-assembly ---
    // VOLT 48V 15Ah: lebih banyak sel, build & weld lebih lama, initial charge lebih lama
    const batteryVoltSteps = [
      [10, 'ST-MAIN-02', 56, 180, 0, 5,  1, false],  // Cell Visual Inspection (80 sel)
      [20, 'ST-MAIN-02', 57, 120, 0, 5,  1, false],  // Cell Voltage Check
      [30, 'ST-MAIN-02', 58, 600, 0, 5,  2, false],  // Build Battery Pack 48V
      [40, 'ST-MAIN-02', 59, 480, 0, 5,  2, false],  // Spot Weld Cell Tabs
      [50, 'ST-MAIN-02', 60, 900, 0, 10, 0, true ],  // Initial Charge Cycle 48V ← bottleneck
      [60, 'ST-MAIN-02', 62, 180, 0, 5,  1, false],  // Battery Final QC Check
    ];
    // ECO 36V 10Ah: ~60% jumlah sel VOLT → build, weld, charge lebih cepat
    const batteryEcoSteps = [
      [10, 'ST-MAIN-02', 56, 120, 0, 5,  1, false],  // Cell Visual Inspection (50 sel)
      [20, 'ST-MAIN-02', 57, 120, 0, 5,  1, false],  // Cell Voltage Check (sama prosedur)
      [30, 'ST-MAIN-02', 58, 420, 0, 5,  2, false],  // Build Battery Pack 36V
      [40, 'ST-MAIN-02', 59, 300, 0, 5,  2, false],  // Spot Weld Cell Tabs (lebih sedikit)
      [50, 'ST-MAIN-02', 60, 600, 0, 10, 1, true ],  // Initial Charge Cycle 36V ← bottleneck
      [60, 'ST-MAIN-02', 62, 180, 0, 5,  1, false],  // Battery Final QC Check (sama)
    ];

    // Helper: build detail rows dari steps + routing codes
    const buildDetailRows = async (steps, routingCodes) => {
      const rows = [];
      for (const code of routingCodes) {
        const routingId = await getRoutingId(queryInterface, code);
        for (const [seq, stCode, jobId, stdTime, setupTime, moveTime, manpower, isBottleneck] of steps) {
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
            is_bottleneck:     isBottleneck,
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