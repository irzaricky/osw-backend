/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // =========================================================================
    // s_part_routings
    // Setiap PRODUCT part memiliki satu default routing yang melewati semua
    // line produksi utama: Frame → Paint → Electrical → Final → Test → QC →
    // Packing → FG.
    //
    // WIP parts (sub-assembly) memiliki routing masing-masing sesuai jenisnya.
    // =========================================================================

    await queryInterface.bulkInsert('s_part_routings', [
      // -----------------------------------------------------------------------
      // VOLT PRODUCTS (id 1-6) — semua pakai routing yang sama: ROUTE-VOLT
      // -----------------------------------------------------------------------
      {
        id: 1,
        routing_code: 'ROUTE-VOLT-STD-1',
        part_id: 1,
        line_id: null, // routing header, bukan per-line
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for VOLT STALLION BLACK GEN 2025',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: 2,
        routing_code: 'ROUTE-VOLT-STD-2',
        part_id: 2,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for VOLT ARMOR GREY GEN 2025',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: 3,
        routing_code: 'ROUTE-VOLT-STD-3',
        part_id: 3,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for VOLT ROYAL WHITE GEN 2025',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: 4,
        routing_code: 'ROUTE-VOLT-STD-4',
        part_id: 4,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for VOLT STALLION BLACK GEN 2026',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: 5,
        routing_code: 'ROUTE-VOLT-STD-5',
        part_id: 5,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for VOLT ARMOR GREY GEN 2026',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: 6,
        routing_code: 'ROUTE-VOLT-STD-6',
        part_id: 6,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for VOLT ROYAL WHITE GEN 2026',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // -----------------------------------------------------------------------
      // ECO PRODUCTS (id 7-12) — routing ECO
      // -----------------------------------------------------------------------
      {
        id: 7,
        routing_code: 'ROUTE-ECO-STD-1',
        part_id: 7,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for ECO STALLION BLACK GEN 2025',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: 8,
        routing_code: 'ROUTE-ECO-STD-2',
        part_id: 8,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for ECO ARMOR GREY GEN 2025',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: 9,
        routing_code: 'ROUTE-ECO-STD-3',
        part_id: 9,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for ECO ROYAL WHITE GEN 2025',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: 10,
        routing_code: 'ROUTE-ECO-STD-4',
        part_id: 10,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for ECO STALLION BLACK GEN 2026',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: 11,
        routing_code: 'ROUTE-ECO-STD-5',
        part_id: 11,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for ECO ARMOR GREY GEN 2026',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        id: 12,
        routing_code: 'ROUTE-ECO-STD-6',
        part_id: 12,
        line_id: null,
        version: 1,
        is_default: true,
        active: true,
        description: 'Standard Production Routing for ECO ROYAL WHITE GEN 2026',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // -----------------------------------------------------------------------
      // WIP — Wheel Assembly 26" (Volt) → Line Assembly Final (id=4)
      // part_id 13: ASSY-WHEEL-F-26
      // -----------------------------------------------------------------------
      {
        id: 13,
        routing_code: 'ROUTE-WHL-F-26',
        part_id: 13,
        line_id: 4,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Front Wheel Assy 26 Inch (Volt)',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 14: ASSY-WHEEL-F-20
      {
        id: 14,
        routing_code: 'ROUTE-WHL-F-20',
        part_id: 14,
        line_id: 4,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Front Wheel Assy 20 Inch (Eco)',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 15: ASSY-WHEEL-R-MOTOR-26
      {
        id: 15,
        routing_code: 'ROUTE-WHL-R-26',
        part_id: 15,
        line_id: 3,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Rear Motor Wheel Assy 26" 350W (Volt)',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 16: ASSY-WHEEL-R-MOTOR-20
      {
        id: 16,
        routing_code: 'ROUTE-WHL-R-20',
        part_id: 16,
        line_id: 3,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Rear Motor Wheel Assy 20" 250W (Eco)',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 17: ASSY-HANDLEBAR-VC
      {
        id: 17,
        routing_code: 'ROUTE-HNDLBR-VC',
        part_id: 17,
        line_id: 4,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Handlebar Set VoltCity',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 18: ASSY-HUB-F
      {
        id: 18,
        routing_code: 'ROUTE-HUB-F',
        part_id: 18,
        line_id: 4,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Front Hub System Assembly',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 19: ASSY-MOTOR-HUB-48V
      {
        id: 19,
        routing_code: 'ROUTE-MTR-48V',
        part_id: 19,
        line_id: 3,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Hub Motor Listrik 48V (Sub-Assy Volt)',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 20: ASSY-MOTOR-HUB-36V
      {
        id: 20,
        routing_code: 'ROUTE-MTR-36V',
        part_id: 20,
        line_id: 3,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Hub Motor Listrik 36V (Sub-Assy Eco)',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 21: PART-FRAME-VC
      {
        id: 21,
        routing_code: 'ROUTE-FRM-VC',
        part_id: 21,
        line_id: 1,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Main Frame VoltCity Unpainted',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 22: PART-FRAME-EF
      {
        id: 22,
        routing_code: 'ROUTE-FRM-EF',
        part_id: 22,
        line_id: 1,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Main Frame EcoFold Unpainted',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 25: PART-BATT-48V
      {
        id: 23,
        routing_code: 'ROUTE-BATT-48V',
        part_id: 25,
        line_id: 2,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Lithium Battery Pack 48V 15Ah (Volt)',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      // part_id 26: PART-BATT-36V
      {
        id: 24,
        routing_code: 'ROUTE-BATT-36V',
        part_id: 26,
        line_id: 2,
        version: 1,
        is_default: true,
        active: true,
        description: 'Routing Lithium Battery Pack 36V 10Ah (Eco)',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    ]);

    // =========================================================================
    // s_part_routing_details
    //
    // Referensi station_id & job_id dari s_stations & s_jobs:
    //
    // VOLT / ECO PRODUCT routing detail:
    //   seq 10  → Frame Line    : ST-FRM-INSP(1)   JOB-INSP-DIM(1)
    //   seq 20  → Frame Line    : ST-FRM-WELD(2)   JOB-INSP-WELD(2)
    //   seq 30  → Frame Line    : ST-FRM-ALIGN(3)  JOB-ALIGN-FRM(3)
    //   seq 40  → Frame Line    : ST-FRM-BRKT(4)   JOB-INST-BRKT(4)
    //   seq 50  → Frame Line    : ST-FRM-FQC(5)    JOB-QC-FRM(5)
    //   seq 60  → Paint Primer  : ST-PRM-CLEAN(21) JOB-CLEAN-FNL(17)
    //   seq 70  → Paint Primer  : ST-PRM-SPRAY(22) JOB-SPRAY-PRM(11)
    //   seq 80  → Paint Primer  : ST-PRM-OVEN(23)  JOB-OVEN-PRM(12)
    //   seq 90  → Paint Primer  : ST-PRM-QC(24)    JOB-QC-PRM(13)
    //   seq 100 → Paint Color   : ST-COL-SPRAY(25) JOB-SPRAY-COL(14)
    //   seq 110 → Paint Color   : ST-COL-OVEN(26)  JOB-OVEN-COL(15)
    //   seq 120 → Paint Color   : ST-COL-QC(27)    JOB-QC-COL(16)
    //   seq 130 → Paint Coat    : ST-COAT-CLEAN(28) JOB-CLEAN-FNL(17)
    //   seq 140 → Paint Coat    : ST-COAT-SPRAY(29) JOB-SPRAY-COAT(18)
    //   seq 150 → Paint Coat    : ST-COAT-OVEN(30)  JOB-OVEN-COAT(19)
    //   seq 160 → Paint Coat    : ST-COAT-THK(31)   JOB-INSP-THK(20)
    //   seq 170 → Paint Coat    : ST-COAT-VIS(32)   JOB-INSP-VIS(21)
    //   seq 180 → Electrical    : ST-EL-WIRE(6)    JOB-INST-WIRE(6)
    //   seq 190 → Electrical    : ST-EL-CTRL(7)    JOB-INST-CTRL(7)
    //   seq 200 → Electrical    : ST-EL-MOTOR(8)   JOB-INST-MOTOR(8)
    //   seq 210 → Electrical    : ST-EL-BATT(9)    JOB-INST-BATT(9)
    //   seq 220 → Electrical    : ST-EL-TEST(10)   JOB-TEST-ELEC(10)
    //   seq 230 → Final Assy    : ST-FNL-WHEEL(11) JOB-INST-WHL(38)
    //   seq 240 → Final Assy    : ST-FNL-BRAKE(12) JOB-INST-BRK(39)
    //   seq 250 → Final Assy    : ST-FNL-HMI(13)   JOB-INST-HND(41)
    //   seq 260 → Final Assy    : ST-FNL-ACC(14)   JOB-INST-ACC(43)
    //   seq 270 → Final Assy    : ST-FNL-FQC(15)   JOB-CHK-ASSY(44)
    //   seq 280 → Test          : ST-TST-CHG(37)   JOB-TST-FULLCHG(63)
    //   seq 290 → Test          : ST-TST-ELEC(38)  JOB-TST-ELEC-SF(65)
    //   seq 300 → Test          : ST-TST-PERF(39)  JOB-TST-SPEED(66)
    //   seq 310 → QC Final      : ST-QC-ROAD(16)   JOB-SIM-ROAD(46)
    //   seq 320 → QC Final      : ST-QC-AUDIT(17)  JOB-VIS-FIN(48)
    //   seq 330 → Packing       : ST-PACK-PREP(18) JOB-CLN-UNIT(50)
    //   seq 340 → Packing       : ST-PACK-PROC(19) JOB-PCK-BOX(52)
    //   seq 350 → FG            : ST-WH-FG-TRF(20) JOB-MOV-FG(54)
    // =========================================================================

    // Helper: build standard VOLT/ECO product routing details
    const buildProductRoutingDetails = (routingId, startId) => {
      const steps = [
        // Frame Line
        { seq: 10,  station_id: 1,  job_id: 1,  std: 120,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 20,  station_id: 2,  job_id: 2,  std: 240,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 30,  station_id: 3,  job_id: 3,  std: 300,  setup: 30,  queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 40,  station_id: 4,  job_id: 4,  std: 360,  setup: 30,  queue: 0, move: 5,  mp: 2, bottleneck: false },
        { seq: 50,  station_id: 5,  job_id: 5,  std: 180,  setup: 0,   queue: 0, move: 10, mp: 1, bottleneck: false },
        // Paint Primer
        { seq: 60,  station_id: 21, job_id: 17, std: 180,  setup: 60,  queue: 0, move: 10, mp: 1, bottleneck: false },
        { seq: 70,  station_id: 22, job_id: 11, std: 360,  setup: 60,  queue: 0, move: 10, mp: 1, bottleneck: false },
        { seq: 80,  station_id: 23, job_id: 12, std: 900,  setup: 0,   queue: 0, move: 10, mp: 0, bottleneck: false },
        { seq: 90,  station_id: 24, job_id: 13, std: 180,  setup: 0,   queue: 0, move: 10, mp: 1, bottleneck: false },
        // Paint Color
        { seq: 100, station_id: 25, job_id: 14, std: 480,  setup: 60,  queue: 0, move: 10, mp: 1, bottleneck: false },
        { seq: 110, station_id: 26, job_id: 15, std: 1200, setup: 0,   queue: 0, move: 10, mp: 0, bottleneck: true  },
        { seq: 120, station_id: 27, job_id: 16, std: 240,  setup: 0,   queue: 0, move: 10, mp: 1, bottleneck: false },
        // Paint Color Coat
        { seq: 130, station_id: 28, job_id: 17, std: 180,  setup: 60,  queue: 0, move: 10, mp: 1, bottleneck: false },
        { seq: 140, station_id: 29, job_id: 18, std: 360,  setup: 60,  queue: 0, move: 10, mp: 1, bottleneck: false },
        { seq: 150, station_id: 30, job_id: 19, std: 1080, setup: 0,   queue: 0, move: 10, mp: 0, bottleneck: false },
        { seq: 160, station_id: 31, job_id: 20, std: 180,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 170, station_id: 32, job_id: 21, std: 180,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        // Electrical
        { seq: 180, station_id: 6,  job_id: 6,  std: 360,  setup: 30,  queue: 0, move: 5,  mp: 2, bottleneck: false },
        { seq: 190, station_id: 7,  job_id: 7,  std: 300,  setup: 30,  queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 200, station_id: 8,  job_id: 8,  std: 420,  setup: 30,  queue: 0, move: 5,  mp: 2, bottleneck: true  },
        { seq: 210, station_id: 9,  job_id: 9,  std: 360,  setup: 30,  queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 220, station_id: 10, job_id: 10, std: 300,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        // Final Assembly
        { seq: 230, station_id: 11, job_id: 38, std: 240,  setup: 30,  queue: 0, move: 5,  mp: 2, bottleneck: false },
        { seq: 240, station_id: 12, job_id: 39, std: 240,  setup: 30,  queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 250, station_id: 13, job_id: 41, std: 180,  setup: 30,  queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 260, station_id: 14, job_id: 43, std: 180,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 270, station_id: 15, job_id: 44, std: 180,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        // Charging & Testing
        { seq: 280, station_id: 37, job_id: 63, std: 720,  setup: 0,   queue: 0, move: 5,  mp: 0, bottleneck: false },
        { seq: 290, station_id: 38, job_id: 65, std: 300,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 300, station_id: 39, job_id: 66, std: 480,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        // QC Final
        { seq: 310, station_id: 16, job_id: 46, std: 300,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 320, station_id: 17, job_id: 48, std: 180,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        // Packing
        { seq: 330, station_id: 18, job_id: 50, std: 120,  setup: 0,   queue: 0, move: 5,  mp: 1, bottleneck: false },
        { seq: 340, station_id: 19, job_id: 52, std: 240,  setup: 0,   queue: 0, move: 5,  mp: 2, bottleneck: false },
        // Finished Goods
        { seq: 350, station_id: 20, job_id: 54, std: 120,  setup: 0,   queue: 0, move: 0,  mp: 1, bottleneck: false },
      ];

      return steps.map((s, i) => ({
        id: startId + i,
        routing_id: routingId,
        sequence: s.seq,
        station_id: s.station_id,
        job_id: s.job_id,
        standard_time: s.std,
        setup_time: s.setup,
        queue_time: s.queue,
        move_time: s.move,
        manpower_required: s.mp,
        is_bottleneck: s.bottleneck,
        created_at: now,
        updated_at: now,
      }));
    };

    // 35 steps per product routing × 12 products = 420 detail rows (id 1–420)
    const STEPS_PER_PRODUCT = 35;
    let productDetails = [];
    for (let routingId = 1; routingId <= 12; routingId++) {
      const startId = (routingId - 1) * STEPS_PER_PRODUCT + 1;
      productDetails = productDetails.concat(
        buildProductRoutingDetails(routingId, startId)
      );
    }

    // -------------------------------------------------------------------------
    // WIP routing details
    // Next id starts at 421
    // -------------------------------------------------------------------------
    let wipId = 421;

    const wipDetails = [
      // -----------------------------------------------------------------------
      // routing_id 13: ASSY-WHEEL-F-26 (Front Wheel 26" Volt)
      // Line Final Assembly, stations: ST-FNL-WHEEL(11)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 13, sequence: 10, station_id: 11, job_id: 38, standard_time: 240, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: false },
      { id: wipId++, routing_id: 13, sequence: 20, station_id: 15, job_id: 44, standard_time: 120, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 14: ASSY-WHEEL-F-20 (Front Wheel 20" Eco)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 14, sequence: 10, station_id: 11, job_id: 38, standard_time: 240, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: false },
      { id: wipId++, routing_id: 14, sequence: 20, station_id: 15, job_id: 44, standard_time: 120, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 15: ASSY-WHEEL-R-MOTOR-26 (Rear Motor Wheel 26" 350W)
      // Line Electrical: ST-EL-MOTOR(8) → ST-EL-TEST(10)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 15, sequence: 10, station_id: 8,  job_id: 8,  standard_time: 420, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: true  },
      { id: wipId++, routing_id: 15, sequence: 20, station_id: 10, job_id: 10, standard_time: 300, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 16: ASSY-WHEEL-R-MOTOR-20 (Rear Motor Wheel 20" 250W)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 16, sequence: 10, station_id: 8,  job_id: 8,  standard_time: 420, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: true  },
      { id: wipId++, routing_id: 16, sequence: 20, station_id: 10, job_id: 10, standard_time: 300, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 17: ASSY-HANDLEBAR-VC
      // Line Final Assembly: ST-FNL-HMI(13) → ST-FNL-FQC(15)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 17, sequence: 10, station_id: 13, job_id: 41, standard_time: 180, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 17, sequence: 20, station_id: 15, job_id: 44, standard_time: 120, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 18: ASSY-HUB-F (Front Hub System Assembly)
      // Line Final Assembly: ST-FNL-WHEEL(11) → ST-FNL-FQC(15)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 18, sequence: 10, station_id: 11, job_id: 38, standard_time: 180, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 18, sequence: 20, station_id: 15, job_id: 45, standard_time: 120, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 19: ASSY-MOTOR-HUB-48V (Hub Motor 48V)
      // Line Electrical: ST-EL-MOTOR(8) → ST-EL-TEST(10)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 19, sequence: 10, station_id: 8,  job_id: 8,  standard_time: 420, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: true  },
      { id: wipId++, routing_id: 19, sequence: 20, station_id: 10, job_id: 10, standard_time: 300, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 20: ASSY-MOTOR-HUB-36V (Hub Motor 36V)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 20, sequence: 10, station_id: 8,  job_id: 8,  standard_time: 420, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: true  },
      { id: wipId++, routing_id: 20, sequence: 20, station_id: 10, job_id: 10, standard_time: 300, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 21: PART-FRAME-VC (Main Frame VoltCity Unpainted)
      // Line Frame: ST-FRM-INSP(1) → ST-FRM-WELD(2) → ST-FRM-ALIGN(3) →
      //             ST-FRM-BRKT(4) → ST-FRM-FQC(5)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 21, sequence: 10, station_id: 1,  job_id: 1,  standard_time: 120, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 21, sequence: 20, station_id: 2,  job_id: 2,  standard_time: 240, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 21, sequence: 30, station_id: 3,  job_id: 3,  standard_time: 300, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 21, sequence: 40, station_id: 4,  job_id: 4,  standard_time: 360, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: false },
      { id: wipId++, routing_id: 21, sequence: 50, station_id: 5,  job_id: 5,  standard_time: 180, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 22: PART-FRAME-EF (Main Frame EcoFold Unpainted)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 22, sequence: 10, station_id: 1,  job_id: 1,  standard_time: 120, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 22, sequence: 20, station_id: 2,  job_id: 2,  standard_time: 240, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 22, sequence: 30, station_id: 3,  job_id: 3,  standard_time: 300, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 22, sequence: 40, station_id: 4,  job_id: 4,  standard_time: 360, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: false },
      { id: wipId++, routing_id: 22, sequence: 50, station_id: 5,  job_id: 5,  standard_time: 180, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 23: PART-BATT-48V (Battery Pack 48V 15Ah)
      // Line Battery: ST-BATT-CELL(33) → ST-BATT-ASSY(34) →
      //               ST-BATT-TEST(35) → ST-BATT-QC(36)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 23, sequence: 10, station_id: 33, job_id: 56, standard_time: 180, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 23, sequence: 20, station_id: 33, job_id: 57, standard_time: 120, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 23, sequence: 30, station_id: 34, job_id: 58, standard_time: 600, setup_time: 60, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: true  },
      { id: wipId++, routing_id: 23, sequence: 40, station_id: 34, job_id: 59, standard_time: 480, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: false },
      { id: wipId++, routing_id: 23, sequence: 50, station_id: 35, job_id: 60, standard_time: 900, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 0, is_bottleneck: false },
      { id: wipId++, routing_id: 23, sequence: 60, station_id: 35, job_id: 61, standard_time: 480, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 23, sequence: 70, station_id: 36, job_id: 62, standard_time: 180, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },

      // -----------------------------------------------------------------------
      // routing_id 24: PART-BATT-36V (Battery Pack 36V 10Ah)
      // -----------------------------------------------------------------------
      { id: wipId++, routing_id: 24, sequence: 10, station_id: 33, job_id: 56, standard_time: 180, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 24, sequence: 20, station_id: 33, job_id: 57, standard_time: 120, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 24, sequence: 30, station_id: 34, job_id: 58, standard_time: 600, setup_time: 60, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: true  },
      { id: wipId++, routing_id: 24, sequence: 40, station_id: 34, job_id: 59, standard_time: 480, setup_time: 30, queue_time: 0, move_time: 5, manpower_required: 2, is_bottleneck: false },
      { id: wipId++, routing_id: 24, sequence: 50, station_id: 35, job_id: 60, standard_time: 900, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 0, is_bottleneck: false },
      { id: wipId++, routing_id: 24, sequence: 60, station_id: 35, job_id: 61, standard_time: 480, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
      { id: wipId++, routing_id: 24, sequence: 70, station_id: 36, job_id: 62, standard_time: 180, setup_time: 0,  queue_time: 0, move_time: 5, manpower_required: 1, is_bottleneck: false },
    ];

    // Inject timestamps for WIP details
    const wipDetailsWithTimestamps = wipDetails.map((d) => ({
      ...d,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert(
      's_part_routing_details',
      [...productDetails, ...wipDetailsWithTimestamps]
    );
  },

  // ---------------------------------------------------------------------------
  async down(queryInterface, Sequelize) {
    // Hapus detail dulu (FK constraint), baru header
    await queryInterface.bulkDelete('s_part_routing_details', {
      routing_id: {
        [Sequelize.Op.between]: [1, 24],
      },
    });

    await queryInterface.bulkDelete('s_part_routings', {
      id: {
        [Sequelize.Op.between]: [1, 24],
      },
    });
  },
};