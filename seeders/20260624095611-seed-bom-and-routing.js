'use strict';

/**
 * SEEDER 2 — BOM + Part Routing + Part Routing Detail Materials (REVISED)
 *
 * STRUKTUR LEVEL BOM:
 * - Level 0: Finished Products (VOBKME2025, VOGRME2025, etc.)
 * - Level 1: Major Sub-Assemblies dengan BOM (ASSY-WHEEL-*, ASSY-MOTOR-*, PART-BATT-*)
 * - Level 2: Secondary Components/WIP dengan BOM kecil (ASSY-HUB-*, ASSY-HANDLEBAR-*)
 * - Level 3+: Raw Materials / Bought Components (NO BOM) — PART-TIRE, PART-RIM, etc.
 *
 * STEP 0 — Bersihkan data lama
 * STEP 1 — BOM Headers (Level 0 & 1)
 * STEP 2 — BOM Details
 * STEP 3 — Part Routing Headers
 * STEP 4 — Part Routing Details
 * STEP 5 — Part Routing Detail Materials
 */

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
    const getRoutingId  = (code) => getId('s_part_routings',   'routing_code', code);
    const getStationId  = (code) => getId('s_stations',        'station_code', code);

    // ── STEP 0: Bersihkan data lama ────────────────────────────────────────
    console.log('[STEP 0] Clearing old data...');
    await q(`DELETE FROM s_part_routing_detail_materials`);
    await q(`DELETE FROM s_part_routing_details`);
    await q(`DELETE FROM s_part_routings`);
    await q(`DELETE FROM s_bom_details`);
    await q(`DELETE FROM s_boms`);
    console.log('[STEP 0] Done.');

    // ── STEP 1: Part map ───────────────────────────────────────────────────
    console.log('[STEP 1] Loading part map...');
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
    console.log(`[STEP 1] Done. ${partRows.length} parts loaded.`);

    // ── STEP 2: BOM Headers ────────────────────────────────────────────────
    console.log('[STEP 2] Inserting BOM headers...');

    const voltProducts = ['VOBKME2025', 'VOGRME2025', 'VOWHME2025', 'VOBKME2026', 'VOGRME2026', 'VOWHME2026'];
    const ecoProducts  = ['ECBKME2025', 'ECGRME2025', 'ECWHME2025', 'ECBKME2026', 'ECGRME2026', 'ECWHME2026'];

    // ═══ LEVEL 0: Finished Product Components ═══
    const voltComponents = [
      { code: 'PART-FRAME-VC',            qty: 1,  level: 1 },
      { code: 'PART-FORK-26',             qty: 1,  level: 1 },
      { code: 'ASSY-WHEEL-F-26',          qty: 1,  level: 1 },
      { code: 'ASSY-WHEEL-R-MOTOR-26',    qty: 1,  level: 1 },
      { code: 'ASSY-HANDLEBAR-VC',        qty: 1,  level: 1 },
      { code: 'PART-SADDLE',              qty: 1,  level: 1 },
      { code: 'PART-SEAT-CLAMP',          qty: 1,  level: 1 },
      { code: 'PART-SEATPOST',            qty: 1,  level: 1 },
      { code: 'PART-PEDAL-SET',           qty: 1,  level: 1 },
      { code: 'PART-CHAIN',               qty: 1,  level: 1 },
      { code: 'PART-BRAKE-SET',           qty: 1,  level: 1 },
      { code: 'PART-RD-UNIT',             qty: 1,  level: 1 },
      { code: 'PART-CONTROLLER-48V',      qty: 1,  level: 1 },
      { code: 'PART-BATT-48V',            qty: 1,  level: 1 },
      { code: 'PART-DISPLAY-LCD',         qty: 1,  level: 1 },
      { code: 'PART-THROTTLE',            qty: 1,  level: 1 },
      { code: 'PART-WIRING-HARNESS',      qty: 1,  level: 1 },
      { code: 'PART-KICKSTAND',           qty: 1,  level: 1 },
      { code: 'PART-GRIP-RUBBER',         qty: 2,  level: 1 },
    ];

    const ecoComponents = [
      { code: 'PART-FRAME-EF',            qty: 1,  level: 1 },
      { code: 'PART-FORK-20',             qty: 1,  level: 1 },
      { code: 'ASSY-WHEEL-F-20',          qty: 1,  level: 1 },
      { code: 'ASSY-WHEEL-R-MOTOR-20',    qty: 1,  level: 1 },
      { code: 'ASSY-HANDLEBAR-VC',        qty: 1,  level: 1 },
      { code: 'PART-SADDLE',              qty: 1,  level: 1 },
      { code: 'PART-SEAT-CLAMP',          qty: 1,  level: 1 },
      { code: 'PART-SEATPOST',            qty: 1,  level: 1 },
      { code: 'PART-PEDAL-SET',           qty: 1,  level: 1 },
      { code: 'PART-CHAIN',               qty: 1,  level: 1 },
      { code: 'PART-BRAKE-SET',           qty: 1,  level: 1 },
      { code: 'PART-RD-UNIT',             qty: 1,  level: 1 },
      { code: 'PART-CONTROLLER-36V',      qty: 1,  level: 1 },
      { code: 'PART-BATT-36V',            qty: 1,  level: 1 },
      { code: 'PART-DISPLAY-LCD',         qty: 1,  level: 1 },
      { code: 'PART-THROTTLE',            qty: 1,  level: 1 },
      { code: 'PART-WIRING-HARNESS',      qty: 1,  level: 1 },
      { code: 'PART-KICKSTAND',           qty: 1,  level: 1 },
      { code: 'PART-GRIP-RUBBER',         qty: 2,  level: 1 },
    ];

    // ═══ LEVEL 1: Sub-Assemblies (dengan BOM sendiri) ═══
    const subAssemblies = {
      // Wheel Assemblies
      'ASSY-WHEEL-F-26': [
        { code: 'ASSY-HUB-F',      qty: 1,  level: 2 },
        { code: 'PART-RIM-26',     qty: 1,  level: 2 },
        { code: 'PART-TIRE-26',    qty: 1,  level: 2 },
        { code: 'PART-SPOKE-SS',   qty: 36, level: 2 },
        { code: 'PART-NUT-M12',    qty: 2,  level: 2 },
      ],
      'ASSY-WHEEL-F-20': [
        { code: 'ASSY-HUB-F',      qty: 1,  level: 2 },
        { code: 'PART-RIM-20',     qty: 1,  level: 2 },
        { code: 'PART-TIRE-20',    qty: 1,  level: 2 },
        { code: 'PART-SPOKE-SS',   qty: 36, level: 2 },
        { code: 'PART-NUT-M12',    qty: 2,  level: 2 },
      ],
      'ASSY-WHEEL-R-MOTOR-26': [
        { code: 'ASSY-MOTOR-HUB-48V', qty: 1,  level: 2 },
        { code: 'PART-RIM-26',        qty: 1,  level: 2 },
        { code: 'PART-TIRE-26',       qty: 1,  level: 2 },
        { code: 'PART-SPOKE-SS',      qty: 36, level: 2 },
        { code: 'PART-FREEWHEEL',     qty: 1,  level: 2 },
        { code: 'PART-NUT-M12',       qty: 2,  level: 2 },
      ],
      'ASSY-WHEEL-R-MOTOR-20': [
        { code: 'ASSY-MOTOR-HUB-36V', qty: 1,  level: 2 },
        { code: 'PART-RIM-20',        qty: 1,  level: 2 },
        { code: 'PART-TIRE-20',       qty: 1,  level: 2 },
        { code: 'PART-SPOKE-SS',      qty: 36, level: 2 },
        { code: 'PART-FREEWHEEL',     qty: 1,  level: 2 },
        { code: 'PART-NUT-M12',       qty: 2,  level: 2 },
      ],

      // Hub & Motor Assemblies
      'ASSY-HUB-F': [
        { code: 'PART-AXLE-F',      qty: 1, level: 3 },
        { code: 'PART-BEARING-608', qty: 2, level: 3 },
        { code: 'PART-HEADSET',     qty: 1, level: 3 },
      ],
      'ASSY-MOTOR-HUB-48V': [
        { code: 'PART-AXLE-R',       qty: 1, level: 3 },
        { code: 'PART-BEARING-608',  qty: 2, level: 3 },
        { code: 'PART-CONNECTOR-MOTOR', qty: 1, level: 3 },
      ],
      'ASSY-MOTOR-HUB-36V': [
        { code: 'PART-AXLE-R',       qty: 1, level: 3 },
        { code: 'PART-BEARING-608',  qty: 2, level: 3 },
        { code: 'PART-CONNECTOR-MOTOR', qty: 1, level: 3 },
      ],

      // Handlebar Assembly
      'ASSY-HANDLEBAR-VC': [
        { code: 'PART-STEM',            qty: 1, level: 2 },
        { code: 'PART-GRIP-RUBBER',     qty: 2, level: 2 },
        { code: 'PART-HANDLEBAR-ENDCAP', qty: 1, level: 2 },
        { code: 'PART-STEM-BOLT-SET',   qty: 1, level: 2 },
      ],

      // Battery Assembly
      'PART-BATT-48V': [
        { code: 'PART-BATT-CASE',    qty: 1,  level: 2 },
        { code: 'PART-BMS-48V',      qty: 1,  level: 2 },
        { code: 'PART-CELL-18650',   qty: 52, level: 2 },
        { code: 'PART-CONNECTOR-BATTERY', qty: 1, level: 2 },
        { code: 'PART-BATTERY-FUSE', qty: 1, level: 2 },
        { code: 'PART-CHARGE-PORT',  qty: 1, level: 2 },
      ],
      'PART-BATT-36V': [
        { code: 'PART-BATT-CASE',    qty: 1,  level: 2 },
        { code: 'PART-BMS-36V',      qty: 1,  level: 2 },
        { code: 'PART-CELL-18650',   qty: 40, level: 2 },
        { code: 'PART-CONNECTOR-BATTERY', qty: 1, level: 2 },
        { code: 'PART-BATTERY-FUSE', qty: 1, level: 2 },
        { code: 'PART-CHARGE-PORT',  qty: 1, level: 2 },
      ],
    };

    const bomHeaderRows      = [];
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

    // Tambah BOM untuk Finished Products
    for (const code of voltProducts)  addBomHeader(code, voltComponents);
    for (const code of ecoProducts)   addBomHeader(code, ecoComponents);

    // Tambah BOM untuk Sub-Assemblies
    for (const [code, comps] of Object.entries(subAssemblies)) addBomHeader(code, comps);

    await queryInterface.bulkInsert('s_boms', bomHeaderRows);
    console.log(`[STEP 2] Done. ${bomHeaderRows.length} BOM headers inserted.`);

    // ── STEP 3: BOM Details ────────────────────────────────────────────────
    console.log('[STEP 3] Inserting BOM details...');
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
    console.log(`[STEP 3] Done. ${bomDetailRows.length} BOM detail rows inserted.`);

    // ── STEP 4: Part Routing Headers ───────────────────────────────────────
    console.log('[STEP 4] Inserting routing headers...');

    const lineId = await getId('s_lines', 'line_code', 'ASSY-MAIN');

    const routingDefs = [
      { code: 'ROUTE-VOLT-STD-1', partCode: 'VOBKME2025',          desc: 'Routing Assembly VOLT STALLION BLACK GEN 2025'  },
      { code: 'ROUTE-VOLT-STD-2', partCode: 'VOGRME2025',          desc: 'Routing Assembly VOLT ARMOR GREY GEN 2025'      },
      { code: 'ROUTE-VOLT-STD-3', partCode: 'VOWHME2025',          desc: 'Routing Assembly VOLT ROYAL WHITE GEN 2025'     },
      { code: 'ROUTE-VOLT-STD-4', partCode: 'VOBKME2026',          desc: 'Routing Assembly VOLT STALLION BLACK GEN 2026'  },
      { code: 'ROUTE-VOLT-STD-5', partCode: 'VOGRME2026',          desc: 'Routing Assembly VOLT ARMOR GREY GEN 2026'      },
      { code: 'ROUTE-VOLT-STD-6', partCode: 'VOWHME2026',          desc: 'Routing Assembly VOLT ROYAL WHITE GEN 2026'     },
      { code: 'ROUTE-ECO-STD-1',  partCode: 'ECBKME2025',          desc: 'Routing Assembly ECO STALLION BLACK GEN 2025'   },
      { code: 'ROUTE-ECO-STD-2',  partCode: 'ECGRME2025',          desc: 'Routing Assembly ECO ARMOR GREY GEN 2025'       },
      { code: 'ROUTE-ECO-STD-3',  partCode: 'ECWHME2025',          desc: 'Routing Assembly ECO ROYAL WHITE GEN 2025'      },
      { code: 'ROUTE-ECO-STD-4',  partCode: 'ECBKME2026',          desc: 'Routing Assembly ECO STALLION BLACK GEN 2026'   },
      { code: 'ROUTE-ECO-STD-5',  partCode: 'ECGRME2026',          desc: 'Routing Assembly ECO ARMOR GREY GEN 2026'       },
      { code: 'ROUTE-ECO-STD-6',  partCode: 'ECWHME2026',          desc: 'Routing Assembly ECO ROYAL WHITE GEN 2026'      },
      { code: 'ROUTE-WHL-F-26',   partCode: 'ASSY-WHEEL-F-26',     desc: 'Routing Front Wheel Assy 26 Inch (Volt)'        },
      { code: 'ROUTE-WHL-F-20',   partCode: 'ASSY-WHEEL-F-20',     desc: 'Routing Front Wheel Assy 20 Inch (Eco)'         },
      { code: 'ROUTE-WHL-R-26',   partCode: 'ASSY-WHEEL-R-MOTOR-26', desc: 'Routing Rear Motor Wheel Assy 26" 350W (Volt)' },
      { code: 'ROUTE-WHL-R-20',   partCode: 'ASSY-WHEEL-R-MOTOR-20', desc: 'Routing Rear Motor Wheel Assy 20" 250W (Eco)'  },
      { code: 'ROUTE-HNDLBR-VC',  partCode: 'ASSY-HANDLEBAR-VC',   desc: 'Routing Handlebar Set VoltCity'                 },
      { code: 'ROUTE-HUB-F',      partCode: 'ASSY-HUB-F',          desc: 'Routing Front Hub System Assembly'              },
      { code: 'ROUTE-MTR-48V',    partCode: 'ASSY-MOTOR-HUB-48V',  desc: 'Routing Hub Motor 48V Sub-Assy (Volt)'          },
      { code: 'ROUTE-MTR-36V',    partCode: 'ASSY-MOTOR-HUB-36V',  desc: 'Routing Hub Motor 36V Sub-Assy (Eco)'           },
      { code: 'ROUTE-BATT-48V',   partCode: 'PART-BATT-48V',       desc: 'Routing Lithium Battery Pack 48V 15Ah (Volt)'   },
      { code: 'ROUTE-BATT-36V',   partCode: 'PART-BATT-36V',       desc: 'Routing Lithium Battery Pack 36V 10Ah (Eco)'    },
    ];

    await queryInterface.bulkInsert('s_part_routings',
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
    console.log(`[STEP 4] Done. ${routingDefs.length} routing headers inserted.`);

    // ── STEP 5: Part Routing Details ───────────────────────────────────────
    console.log('[STEP 5] Inserting routing details...');

    // Station sequence untuk setiap routing
    const voltAssyStations = [
      ['ST-MAIN-01', 10],
      ['ST-MAIN-02', 20],
      ['ST-MAIN-03', 30],
      ['ST-MAIN-04', 40],
      ['ST-MAIN-05', 50],
      ['ST-MAIN-06', 60],
      ['ST-MAIN-07', 70],
      ['ST-MAIN-08', 80],
      ['ST-MAIN-09', 90],
      ['ST-MAIN-10', 100],
      ['ST-MAIN-11', 110],
      ['ST-MAIN-12', 120],
      ['ST-MAIN-13', 130],
      ['ST-MAIN-14', 140],
      ['ST-MAIN-15', 150],
    ];
    const ecoAssyStations = voltAssyStations;

    const routingStationMap = {
      'ROUTE-VOLT-STD-1': voltAssyStations,
      'ROUTE-VOLT-STD-2': voltAssyStations,
      'ROUTE-VOLT-STD-3': voltAssyStations,
      'ROUTE-VOLT-STD-4': voltAssyStations,
      'ROUTE-VOLT-STD-5': voltAssyStations,
      'ROUTE-VOLT-STD-6': voltAssyStations,
      'ROUTE-ECO-STD-1':  ecoAssyStations,
      'ROUTE-ECO-STD-2':  ecoAssyStations,
      'ROUTE-ECO-STD-3':  ecoAssyStations,
      'ROUTE-ECO-STD-4':  ecoAssyStations,
      'ROUTE-ECO-STD-5':  ecoAssyStations,
      'ROUTE-ECO-STD-6':  ecoAssyStations,
      'ROUTE-WHL-F-26':   [['ST-MAIN-07', 10]],
      'ROUTE-WHL-F-20':   [['ST-MAIN-07', 10]],
      'ROUTE-WHL-R-26':   [['ST-MAIN-05', 10], ['ST-MAIN-07', 20]],
      'ROUTE-WHL-R-20':   [['ST-MAIN-05', 10], ['ST-MAIN-07', 20]],
      'ROUTE-HNDLBR-VC':  [['ST-MAIN-09', 10]],
      'ROUTE-HUB-F':      [['ST-MAIN-07', 10]],
      'ROUTE-MTR-48V':    [['ST-MAIN-05', 10]],
      'ROUTE-MTR-36V':    [['ST-MAIN-05', 10]],
      'ROUTE-BATT-48V':   [['ST-MAIN-02', 10]],
      'ROUTE-BATT-36V':   [['ST-MAIN-02', 10]],
    };

    // Cache station IDs
    const stIds = {};
    for (let i = 1; i <= 15; i++) {
      const code = `ST-MAIN-${String(i).padStart(2, '0')}`;
      stIds[code] = await getStationId(code);
    }

    const routingDetailRows = [];
    const routingDetailIndex = {};

    for (const [routingCode, stations] of Object.entries(routingStationMap)) {
      const routingId = await getRoutingId(routingCode);
      for (const [stationCode, sequence] of stations) {
        const key = `${routingCode}_${stationCode}`;
        routingDetailIndex[key] = routingDetailRows.length;
        routingDetailRows.push({
          routing_id:  routingId,
          station_id:  stIds[stationCode],
          sequence,
          created_at:  now,
          updated_at:  now,
        });
      }
    }

    await queryInterface.bulkInsert('s_part_routing_details', routingDetailRows);
    console.log(`[STEP 5] Done. ${routingDetailRows.length} routing detail rows inserted.`);

    // ── STEP 6: Part Routing Detail Materials ──────────────────────────────
    console.log('[STEP 6] Inserting routing detail materials...');

    const [insertedDetails] = await q(`
      SELECT prd.id, pr.routing_code, prd.station_id
      FROM s_part_routing_details prd
      JOIN s_part_routings pr ON pr.id = prd.routing_id
    `);

    const detailIdMap = {};
    for (const row of insertedDetails) {
      const key = `${row.routing_code}_${row.station_id}`;
      detailIdMap[key] = row.id;
    }

    const resolveDetailId = (routingCode, stationCode) => {
      const stationId = stIds[stationCode];
      const key       = `${routingCode}_${stationId}`;
      const id        = detailIdMap[key];
      if (!id) throw new Error(`routing_detail_id not found for ${routingCode} + ${stationCode}`);
      return id;
    };

    // Definisi material per routing per station
    const materialDefs = [];

    const addMat = (routingCode, stationCode, partCodes) => {
      materialDefs.push({ routingCode, stationCode, partCodes });
    };

    const voltRoutings = ['ROUTE-VOLT-STD-1', 'ROUTE-VOLT-STD-2', 'ROUTE-VOLT-STD-3', 'ROUTE-VOLT-STD-4', 'ROUTE-VOLT-STD-5', 'ROUTE-VOLT-STD-6'];
    const ecoRoutings  = ['ROUTE-ECO-STD-1',  'ROUTE-ECO-STD-2',  'ROUTE-ECO-STD-3',  'ROUTE-ECO-STD-4',  'ROUTE-ECO-STD-5',  'ROUTE-ECO-STD-6'];

    // ═══ MAIN ASSEMBLY ROUTING (Volt) ═══
    for (const rc of voltRoutings) {
      addMat(rc, 'ST-MAIN-01', ['PART-FRAME-VC', 'PART-FORK-26', 'PART-HEADSET', 'PART-SEATPOST', 'PART-SEAT-CLAMP', 'PART-SADDLE']);
      addMat(rc, 'ST-MAIN-02', ['PART-BATT-48V']);
      addMat(rc, 'ST-MAIN-03', ['PART-WIRING-HARNESS', 'PART-DERAIL-CABLE', 'PART-BRAKE-CABLE', 'PART-CONNECTOR-DISPLAY']);
      addMat(rc, 'ST-MAIN-04', ['PART-CONTROLLER-48V', 'PART-DISPLAY-LCD', 'PART-THROTTLE', 'PART-SENSOR-PAS']);
      addMat(rc, 'ST-MAIN-07', ['ASSY-WHEEL-F-26', 'ASSY-WHEEL-R-MOTOR-26', 'PART-PEDAL-SET', 'PART-CHAIN', 'PART-CHAINRING', 'PART-CASSETTE-7SP', 'PART-RD-UNIT', 'PART-RD-HANGER']);
      addMat(rc, 'ST-MAIN-08', ['PART-BRAKE-SET', 'PART-BRAKE-ROTOR-160', 'PART-BRAKE-PADS-SET']);
      addMat(rc, 'ST-MAIN-09', ['ASSY-HANDLEBAR-VC']);
      addMat(rc, 'ST-MAIN-10', ['PART-KICKSTAND']);
    }

    // ═══ MAIN ASSEMBLY ROUTING (Eco) ═══
    for (const rc of ecoRoutings) {
      addMat(rc, 'ST-MAIN-01', ['PART-FRAME-EF', 'PART-FORK-20', 'PART-HEADSET', 'PART-SEATPOST', 'PART-SEAT-CLAMP', 'PART-SADDLE']);
      addMat(rc, 'ST-MAIN-02', ['PART-BATT-36V']);
      addMat(rc, 'ST-MAIN-03', ['PART-WIRING-HARNESS', 'PART-DERAIL-CABLE', 'PART-BRAKE-CABLE', 'PART-CONNECTOR-DISPLAY']);
      addMat(rc, 'ST-MAIN-04', ['PART-CONTROLLER-36V', 'PART-DISPLAY-LCD', 'PART-THROTTLE', 'PART-SENSOR-PAS']);
      addMat(rc, 'ST-MAIN-07', ['ASSY-WHEEL-F-20', 'ASSY-WHEEL-R-MOTOR-20', 'PART-PEDAL-SET', 'PART-CHAIN', 'PART-CHAINRING', 'PART-CASSETTE-7SP', 'PART-RD-UNIT', 'PART-RD-HANGER']);
      addMat(rc, 'ST-MAIN-08', ['PART-BRAKE-SET', 'PART-BRAKE-ROTOR-160', 'PART-BRAKE-PADS-SET']);
      addMat(rc, 'ST-MAIN-09', ['ASSY-HANDLEBAR-VC']);
      addMat(rc, 'ST-MAIN-10', ['PART-KICKSTAND']);
    }

    // ═══ SUB-ASSEMBLY ROUTING ═══
    // Wheel Assemblies
    addMat('ROUTE-WHL-F-26',  'ST-MAIN-07', ['PART-TIRE-26', 'PART-RIM-26', 'PART-SPOKE-SS', 'ASSY-HUB-F', 'PART-NUT-M12']);
    addMat('ROUTE-WHL-F-20',  'ST-MAIN-07', ['PART-TIRE-20', 'PART-RIM-20', 'PART-SPOKE-SS', 'ASSY-HUB-F', 'PART-NUT-M12']);
    addMat('ROUTE-WHL-R-26',  'ST-MAIN-05', ['ASSY-MOTOR-HUB-48V']);
    addMat('ROUTE-WHL-R-26',  'ST-MAIN-07', ['PART-TIRE-26', 'PART-RIM-26', 'PART-SPOKE-SS', 'PART-FREEWHEEL', 'PART-NUT-M12']);
    addMat('ROUTE-WHL-R-20',  'ST-MAIN-05', ['ASSY-MOTOR-HUB-36V']);
    addMat('ROUTE-WHL-R-20',  'ST-MAIN-07', ['PART-TIRE-20', 'PART-RIM-20', 'PART-SPOKE-SS', 'PART-FREEWHEEL', 'PART-NUT-M12']);

    // Hub & Motor Assemblies
    addMat('ROUTE-HUB-F',     'ST-MAIN-07', ['PART-AXLE-F', 'PART-BEARING-608', 'PART-FORK-CROWN-RACE']);
    addMat('ROUTE-MTR-48V',   'ST-MAIN-05', ['PART-AXLE-R', 'PART-BEARING-608', 'PART-CONNECTOR-MOTOR']);
    addMat('ROUTE-MTR-36V',   'ST-MAIN-05', ['PART-AXLE-R', 'PART-BEARING-608', 'PART-CONNECTOR-MOTOR']);

    // Handlebar Assembly
    addMat('ROUTE-HNDLBR-VC', 'ST-MAIN-09', ['PART-STEM', 'PART-GRIP-RUBBER', 'PART-HANDLEBAR-ENDCAP', 'PART-STEM-BOLT-SET']);

    // Battery Assemblies
    addMat('ROUTE-BATT-48V',  'ST-MAIN-02', ['PART-BATT-CASE', 'PART-BMS-48V', 'PART-CELL-18650', 'PART-CONNECTOR-BATTERY', 'PART-BATTERY-FUSE', 'PART-CHARGE-PORT']);
    addMat('ROUTE-BATT-36V',  'ST-MAIN-02', ['PART-BATT-CASE', 'PART-BMS-36V', 'PART-CELL-18650', 'PART-CONNECTOR-BATTERY', 'PART-BATTERY-FUSE', 'PART-CHARGE-PORT']);

    const materialRows = [];
    for (const { routingCode, stationCode, partCodes } of materialDefs) {
      const routingDetailId = resolveDetailId(routingCode, stationCode);
      for (const partCode of partCodes) {
        materialRows.push({
          routing_detail_id: routingDetailId,
          part_id:           getPart(partCode).id,
          created_at:        now,
          updated_at:        now,
        });
      }
    }

    await queryInterface.bulkInsert('s_part_routing_detail_materials', materialRows);
    console.log(`[STEP 6] Done. ${materialRows.length} material rows inserted.`);
    console.log('[DONE] Seeder 2 revised completed.');
  },

  async down(queryInterface) {
    console.log('[DOWN] Rolling back seeder 2...');
    await queryInterface.sequelize.query(`DELETE FROM s_part_routing_detail_materials`);
    await queryInterface.sequelize.query(`DELETE FROM s_part_routing_details`);
    await queryInterface.sequelize.query(`DELETE FROM s_part_routings`);
    await queryInterface.sequelize.query(`DELETE FROM s_bom_details`);
    await queryInterface.sequelize.query(`DELETE FROM s_boms`);
    console.log('[DOWN] Done.');
  },
};