/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // =====================================================
    // GET MASTER DATA
    // =====================================================

    // Parts — ambil juga part_type_code agar type di bom_details selalu sinkron
    const parts = await queryInterface.sequelize.query(
      `
      SELECT id, part_number, part_type_code
      FROM s_parts
      WHERE deleted_at IS NULL
      `,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const partMap = {};
    const partTypeMap = {};
    parts.forEach((p) => {
      partMap[p.part_number]     = p.id;
      partTypeMap[p.part_number] = p.part_type_code;
    });

    const getPartId   = (code) => partMap[code]     || null;
    // Type diambil dari s_parts — TIDAK hardcode di data BOM
    const getPartType = (code) => partTypeMap[code] || null;

    // UOM
    const uoms = await queryInterface.sequelize.query(
      `SELECT id, code FROM s_uoms WHERE deleted_at IS NULL`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const uomMap = {};
    uoms.forEach((u) => { uomMap[u.code] = u.id; });

    // Document Status
    const docStatuses = await queryInterface.sequelize.query(
      `SELECT id, code FROM ref_bom_document_statuses WHERE deleted_at IS NULL`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const docStatusMap = {};
    docStatuses.forEach((s) => { docStatusMap[s.code] = s.id; });

    // Activation Status
    const activationStatuses = await queryInterface.sequelize.query(
      `SELECT id, code FROM ref_bom_activation_statuses WHERE deleted_at IS NULL`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const activationStatusMap = {};
    activationStatuses.forEach((s) => { activationStatusMap[s.code] = s.id; });

    const pcsUomId            = uomMap['PCS']      || null;
    const approvedDocStatusId = docStatusMap['APPROVED'] || null;
    const activeStatusId      = activationStatusMap['ACTIVE'] || null;

    // =====================================================
    // BOM DATA
    // =====================================================
    //
    // ATURAN TYPE di bom_details:
    //   Field `type` diisi otomatis dari part_type_code di s_parts
    //   (lihat PASS 2 — getPartType). Tidak ada hardcode type di sini.
    //
    // HIERARKI LEVEL:
    //   level 1 = komponen langsung di bawah PRODUCT
    //   level 2 = komponen di bawah sub-assembly level 1
    //   level 3 = komponen di bawah sub-assembly level 2
    //
    // CHILD_BOM:
    //   Hanya diisi jika part adalah WIP dan punya BOM sendiri.
    //   RAW tidak boleh punya child_bom.
    //
    // VOLT vs ECO:
    //   Volt  → 26", motor 48V, batt 48V, controller 48V, punya RD (derailleur)
    //   Eco   → 20", motor 36V, batt 36V, controller 36V, single-speed (tanpa RD)

    const boms = [

      // ── SUB-BOM: FRAME VC ────────────────────────────────
      // PART-FRAME-VC = WIP
      //   PART-SEAT-CLAMP → WIP  (komponen WIP kecil)
      //   PART-SEATPOST   → WIP  (komponen WIP)
      //   PART-RD-HANGER  → RAW  ✓
      //   PART-HEADSET    → RAW  ✓
      {
        bom_number:   'BOM - PART-FRAME-VC - V1',
        parent_part:  'PART-FRAME-VC',
        description:  'Frame VoltCity Assembly BOM',
        notes:        'Sub BOM for VoltCity frame assembly',
        bom_version:  1,
        details: [
          { part_number: 'PART-SEAT-CLAMP', qty: 1, level: 2, sequence: 1 },
          { part_number: 'PART-SEATPOST',   qty: 1, level: 2, sequence: 2 },
          { part_number: 'PART-RD-HANGER',  qty: 1, level: 2, sequence: 3 },
          { part_number: 'PART-HEADSET',    qty: 1, level: 2, sequence: 4 },
        ],
      },

      // ── SUB-BOM: FRAME EF ────────────────────────────────
      // PART-FRAME-EF = WIP, Eco single-speed → tidak pakai PART-RD-HANGER
      {
        bom_number:   'BOM - PART-FRAME-EF - V1',
        parent_part:  'PART-FRAME-EF',
        description:  'Frame EcoFold Assembly BOM',
        notes:        'Sub BOM for EcoFold frame assembly',
        bom_version:  1,
        details: [
          { part_number: 'PART-SEAT-CLAMP', qty: 1, level: 2, sequence: 1 },
          { part_number: 'PART-SEATPOST',   qty: 1, level: 2, sequence: 2 },
          { part_number: 'PART-HEADSET',    qty: 1, level: 2, sequence: 3 },
        ],
      },

      // ── SUB-BOM: FORK 26" (Volt) ─────────────────────────
      // PART-FORK-26 = WIP
      //   PART-BEARING-608 → RAW ✓
      //   PART-AXLE-F      → RAW ✓
      {
        bom_number:   'BOM - PART-FORK-26 - V1',
        parent_part:  'PART-FORK-26',
        description:  'Front Suspension Fork 26 Inch BOM',
        notes:        'Sub BOM for Volt front fork',
        bom_version:  1,
        details: [
          { part_number: 'PART-BEARING-608', qty: 2, level: 2, sequence: 1 },
          { part_number: 'PART-AXLE-F',      qty: 1, level: 2, sequence: 2 },
        ],
      },

      // ── SUB-BOM: FRONT HUB ───────────────────────────────
      // ASSY-HUB-F = WIP, semua komponen RAW
      {
        bom_number:   'BOM - ASSY-HUB-F - V1',
        parent_part:  'ASSY-HUB-F',
        description:  'Front Hub Assembly BOM',
        notes:        'Sub BOM for front hub assembly',
        bom_version:  1,
        details: [
          { part_number: 'PART-BEARING-608', qty: 2, level: 3, sequence: 1 },
          { part_number: 'PART-AXLE-F',      qty: 1, level: 3, sequence: 2 },
          { part_number: 'PART-NUT-M12',     qty: 2, level: 3, sequence: 3 },
        ],
      },

      // ── SUB-BOM: FRONT WHEEL 26" (Volt) ─────────────────
      // ASSY-WHEEL-F-26 = WIP
      //   ASSY-HUB-F    → WIP (child_bom)
      //   PART-TIRE-26  → RAW ✓
      //   PART-RIM-26   → RAW ✓
      //   PART-SPOKE-SS → RAW ✓
      {
        bom_number:   'BOM - ASSY-WHEEL-F-26 - V1',
        parent_part:  'ASSY-WHEEL-F-26',
        description:  'Front Wheel 26 Inch Assembly BOM',
        notes:        'Sub BOM for Volt front wheel',
        bom_version:  1,
        details: [
          { part_number: 'ASSY-HUB-F',    qty: 1,  child_bom: 'BOM - ASSY-HUB-F - V1', level: 2, sequence: 1 },
          { part_number: 'PART-TIRE-26',  qty: 1,                                        level: 2, sequence: 2 },
          { part_number: 'PART-RIM-26',   qty: 1,                                        level: 2, sequence: 3 },
          { part_number: 'PART-SPOKE-SS', qty: 36,                                       level: 2, sequence: 4 },
        ],
      },

      // ── SUB-BOM: FRONT WHEEL 20" (Eco) ──────────────────
      {
        bom_number:   'BOM - ASSY-WHEEL-F-20 - V1',
        parent_part:  'ASSY-WHEEL-F-20',
        description:  'Front Wheel 20 Inch Assembly BOM',
        notes:        'Sub BOM for Eco front wheel',
        bom_version:  1,
        details: [
          { part_number: 'ASSY-HUB-F',    qty: 1,  child_bom: 'BOM - ASSY-HUB-F - V1', level: 2, sequence: 1 },
          { part_number: 'PART-TIRE-20',  qty: 1,                                        level: 2, sequence: 2 },
          { part_number: 'PART-RIM-20',   qty: 1,                                        level: 2, sequence: 3 },
          { part_number: 'PART-SPOKE-SS', qty: 28,                                       level: 2, sequence: 4 },
        ],
      },

      // ── SUB-BOM: HUB MOTOR 48V (Volt) ───────────────────
      // ASSY-MOTOR-HUB-48V = WIP, semua komponen RAW
      {
        bom_number:   'BOM - ASSY-MOTOR-HUB-48V - V1',
        parent_part:  'ASSY-MOTOR-HUB-48V',
        description:  'Hub Motor 48V Sub-Assembly BOM',
        notes:        'Sub BOM for Volt hub motor',
        bom_version:  1,
        details: [
          { part_number: 'PART-BEARING-608', qty: 2, level: 3, sequence: 1 },
          { part_number: 'PART-AXLE-R',      qty: 1, level: 3, sequence: 2 },
          { part_number: 'PART-NUT-M12',     qty: 2, level: 3, sequence: 3 },
        ],
      },

      // ── SUB-BOM: HUB MOTOR 36V (Eco) ────────────────────
      {
        bom_number:   'BOM - ASSY-MOTOR-HUB-36V - V1',
        parent_part:  'ASSY-MOTOR-HUB-36V',
        description:  'Hub Motor 36V Sub-Assembly BOM',
        notes:        'Sub BOM for Eco hub motor',
        bom_version:  1,
        details: [
          { part_number: 'PART-BEARING-608', qty: 2, level: 3, sequence: 1 },
          { part_number: 'PART-AXLE-R',      qty: 1, level: 3, sequence: 2 },
          { part_number: 'PART-NUT-M12',     qty: 2, level: 3, sequence: 3 },
        ],
      },

      // ── SUB-BOM: REAR MOTOR WHEEL 26" 350W (Volt) ───────
      // ASSY-WHEEL-R-MOTOR-26 = WIP
      //   ASSY-MOTOR-HUB-48V → WIP (child_bom)
      //   PART-TIRE-26       → RAW ✓
      //   PART-RIM-26        → RAW ✓
      //   PART-SPOKE-SS      → RAW ✓
      //   PART-AXLE-R        → RAW ✓
      //   PART-NUT-M12       → RAW ✓
      //   PART-FREEWHEEL     → RAW ✓
      {
        bom_number:   'BOM - ASSY-WHEEL-R-MOTOR-26 - V1',
        parent_part:  'ASSY-WHEEL-R-MOTOR-26',
        description:  'Rear Motor Wheel 26 Inch 350W Assembly BOM',
        notes:        'Sub BOM for Volt rear motor wheel',
        bom_version:  1,
        details: [
          { part_number: 'ASSY-MOTOR-HUB-48V', qty: 1,  child_bom: 'BOM - ASSY-MOTOR-HUB-48V - V1', level: 2, sequence: 1 },
          { part_number: 'PART-TIRE-26',        qty: 1,                                                level: 2, sequence: 2 },
          { part_number: 'PART-RIM-26',         qty: 1,                                                level: 2, sequence: 3 },
          { part_number: 'PART-SPOKE-SS',       qty: 36,                                               level: 2, sequence: 4 },
          { part_number: 'PART-AXLE-R',         qty: 1,                                                level: 2, sequence: 5 },
          { part_number: 'PART-NUT-M12',        qty: 2,                                                level: 2, sequence: 6 },
          { part_number: 'PART-FREEWHEEL',      qty: 1,                                                level: 2, sequence: 7 },
        ],
      },

      // ── SUB-BOM: REAR MOTOR WHEEL 20" 250W (Eco) ────────
      {
        bom_number:   'BOM - ASSY-WHEEL-R-MOTOR-20 - V1',
        parent_part:  'ASSY-WHEEL-R-MOTOR-20',
        description:  'Rear Motor Wheel 20 Inch 250W Assembly BOM',
        notes:        'Sub BOM for Eco rear motor wheel',
        bom_version:  1,
        details: [
          { part_number: 'ASSY-MOTOR-HUB-36V', qty: 1,  child_bom: 'BOM - ASSY-MOTOR-HUB-36V - V1', level: 2, sequence: 1 },
          { part_number: 'PART-TIRE-20',        qty: 1,                                                level: 2, sequence: 2 },
          { part_number: 'PART-RIM-20',         qty: 1,                                                level: 2, sequence: 3 },
          { part_number: 'PART-SPOKE-SS',       qty: 28,                                               level: 2, sequence: 4 },
          { part_number: 'PART-AXLE-R',         qty: 1,                                                level: 2, sequence: 5 },
          { part_number: 'PART-NUT-M12',        qty: 2,                                                level: 2, sequence: 6 },
        ],
      },

      // ── SUB-BOM: BATTERY PACK 48V (Volt) ────────────────
      // PART-BATT-48V = WIP
      //   PART-BATT-CASE  → RAW ✓
      //   PART-BMS-48V    → RAW ✓
      //   PART-CELL-18650 → RAW ✓  (48V 15Ah ≈ 60 sel)
      {
        bom_number:   'BOM - PART-BATT-48V - V1',
        parent_part:  'PART-BATT-48V',
        description:  'Battery Pack 48V 15Ah BOM',
        notes:        'Sub BOM for Volt battery pack',
        bom_version:  1,
        details: [
          { part_number: 'PART-BATT-CASE',  qty: 1,  level: 2, sequence: 1 },
          { part_number: 'PART-BMS-48V',    qty: 1,  level: 2, sequence: 2 },
          { part_number: 'PART-CELL-18650', qty: 60, level: 2, sequence: 3 },
        ],
      },

      // ── SUB-BOM: BATTERY PACK 36V (Eco) ─────────────────
      // PART-BATT-36V = WIP
      //   PART-BATT-CASE  → RAW ✓
      //   PART-BMS-36V    → RAW ✓
      //   PART-CELL-18650 → RAW ✓  (36V 10Ah ≈ 40 sel)
      {
        bom_number:   'BOM - PART-BATT-36V - V1',
        parent_part:  'PART-BATT-36V',
        description:  'Battery Pack 36V 10Ah BOM',
        notes:        'Sub BOM for Eco battery pack',
        bom_version:  1,
        details: [
          { part_number: 'PART-BATT-CASE',  qty: 1,  level: 2, sequence: 1 },
          { part_number: 'PART-BMS-36V',    qty: 1,  level: 2, sequence: 2 },
          { part_number: 'PART-CELL-18650', qty: 40, level: 2, sequence: 3 },
        ],
      },

      // ── SUB-BOM: HANDLEBAR SET (shared Volt & Eco) ───────
      // ASSY-HANDLEBAR-VC = WIP
      //   PART-STEM        → WIP
      //   PART-GRIP-RUBBER → WIP (sepasang kiri-kanan, qty 2)
      {
        bom_number:   'BOM - ASSY-HANDLEBAR-VC - V1',
        parent_part:  'ASSY-HANDLEBAR-VC',
        description:  'Handlebar Set VoltCity Assembly BOM',
        notes:        'Sub BOM for handlebar assembly, shared Volt and Eco',
        bom_version:  1,
        details: [
          { part_number: 'PART-STEM',        qty: 1, level: 2, sequence: 1 },
          { part_number: 'PART-GRIP-RUBBER', qty: 2, level: 2, sequence: 2 },
        ],
      },

      // ══════════════════════════════════════════════════════
      // BOM PRODUK — VOLT (6 varian: 3 warna × 2 generasi)
      //
      // Semua detail level 1 bertipe WIP karena seluruh bahan
      // RAW sudah terserap di sub-BOM masing-masing.
      // PART-FORK-20 (Eco) tidak punya child_bom karena
      // di seeds tidak ada sub-BOM untuk fork 20".
      // ══════════════════════════════════════════════════════

      // ── VOBKME2025 ───────────────────────────────────────
      {
        bom_number:   'BOM - VOBKME2025 - V1',
        parent_part:  'VOBKME2025',
        description:  'VOLT STALLION BLACK GEN 2025 — Main BOM',
        notes:        'Main BOM for Volt Stallion Black Gen 2025',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-VC',        qty: 1, child_bom: 'BOM - PART-FRAME-VC - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-26',       qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-26 - V1',       level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-26', qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-26 - V1', level: 1, sequence: 3  },
          { part_number: 'PART-FORK-26',          qty: 1, child_bom: 'BOM - PART-FORK-26 - V1',          level: 1, sequence: 4  },
          { part_number: 'PART-BATT-48V',         qty: 1, child_bom: 'BOM - PART-BATT-48V - V1',         level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-48V',   qty: 1,                                                  level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',        qty: 1,                                                  level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',           qty: 1,                                                  level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',        qty: 1,                                                  level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',            qty: 1,                                                  level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',      qty: 1,                                                  level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',         qty: 1,                                                  level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',   qty: 1,                                                  level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',     qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',      level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',        qty: 1,                                                  level: 1, sequence: 15 },
          { part_number: 'PART-RD-UNIT',          qty: 1,                                                  level: 1, sequence: 16 },
        ],
      },

      // ── VOGRME2025 ───────────────────────────────────────
      {
        bom_number:   'BOM - VOGRME2025 - V1',
        parent_part:  'VOGRME2025',
        description:  'VOLT ARMOR GREY GEN 2025 — Main BOM',
        notes:        'Main BOM for Volt Armor Grey Gen 2025',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-VC',        qty: 1, child_bom: 'BOM - PART-FRAME-VC - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-26',       qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-26 - V1',       level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-26', qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-26 - V1', level: 1, sequence: 3  },
          { part_number: 'PART-FORK-26',          qty: 1, child_bom: 'BOM - PART-FORK-26 - V1',          level: 1, sequence: 4  },
          { part_number: 'PART-BATT-48V',         qty: 1, child_bom: 'BOM - PART-BATT-48V - V1',         level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-48V',   qty: 1,                                                  level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',        qty: 1,                                                  level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',           qty: 1,                                                  level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',        qty: 1,                                                  level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',            qty: 1,                                                  level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',      qty: 1,                                                  level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',         qty: 1,                                                  level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',   qty: 1,                                                  level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',     qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',      level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',        qty: 1,                                                  level: 1, sequence: 15 },
          { part_number: 'PART-RD-UNIT',          qty: 1,                                                  level: 1, sequence: 16 },
        ],
      },

      // ── VOWHME2025 ───────────────────────────────────────
      {
        bom_number:   'BOM - VOWHME2025 - V1',
        parent_part:  'VOWHME2025',
        description:  'VOLT ROYAL WHITE GEN 2025 — Main BOM',
        notes:        'Main BOM for Volt Royal White Gen 2025',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-VC',        qty: 1, child_bom: 'BOM - PART-FRAME-VC - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-26',       qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-26 - V1',       level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-26', qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-26 - V1', level: 1, sequence: 3  },
          { part_number: 'PART-FORK-26',          qty: 1, child_bom: 'BOM - PART-FORK-26 - V1',          level: 1, sequence: 4  },
          { part_number: 'PART-BATT-48V',         qty: 1, child_bom: 'BOM - PART-BATT-48V - V1',         level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-48V',   qty: 1,                                                  level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',        qty: 1,                                                  level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',           qty: 1,                                                  level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',        qty: 1,                                                  level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',            qty: 1,                                                  level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',      qty: 1,                                                  level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',         qty: 1,                                                  level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',   qty: 1,                                                  level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',     qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',      level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',        qty: 1,                                                  level: 1, sequence: 15 },
          { part_number: 'PART-RD-UNIT',          qty: 1,                                                  level: 1, sequence: 16 },
        ],
      },

      // ── VOBKME2026 ───────────────────────────────────────
      {
        bom_number:   'BOM - VOBKME2026 - V1',
        parent_part:  'VOBKME2026',
        description:  'VOLT STALLION BLACK GEN 2026 — Main BOM',
        notes:        'Main BOM for Volt Stallion Black Gen 2026',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-VC',        qty: 1, child_bom: 'BOM - PART-FRAME-VC - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-26',       qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-26 - V1',       level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-26', qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-26 - V1', level: 1, sequence: 3  },
          { part_number: 'PART-FORK-26',          qty: 1, child_bom: 'BOM - PART-FORK-26 - V1',          level: 1, sequence: 4  },
          { part_number: 'PART-BATT-48V',         qty: 1, child_bom: 'BOM - PART-BATT-48V - V1',         level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-48V',   qty: 1,                                                  level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',        qty: 1,                                                  level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',           qty: 1,                                                  level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',        qty: 1,                                                  level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',            qty: 1,                                                  level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',      qty: 1,                                                  level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',         qty: 1,                                                  level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',   qty: 1,                                                  level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',     qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',      level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',        qty: 1,                                                  level: 1, sequence: 15 },
          { part_number: 'PART-RD-UNIT',          qty: 1,                                                  level: 1, sequence: 16 },
        ],
      },

      // ── VOGRME2026 ───────────────────────────────────────
      {
        bom_number:   'BOM - VOGRME2026 - V1',
        parent_part:  'VOGRME2026',
        description:  'VOLT ARMOR GREY GEN 2026 — Main BOM',
        notes:        'Main BOM for Volt Armor Grey Gen 2026',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-VC',        qty: 1, child_bom: 'BOM - PART-FRAME-VC - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-26',       qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-26 - V1',       level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-26', qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-26 - V1', level: 1, sequence: 3  },
          { part_number: 'PART-FORK-26',          qty: 1, child_bom: 'BOM - PART-FORK-26 - V1',          level: 1, sequence: 4  },
          { part_number: 'PART-BATT-48V',         qty: 1, child_bom: 'BOM - PART-BATT-48V - V1',         level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-48V',   qty: 1,                                                  level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',        qty: 1,                                                  level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',           qty: 1,                                                  level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',        qty: 1,                                                  level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',            qty: 1,                                                  level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',      qty: 1,                                                  level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',         qty: 1,                                                  level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',   qty: 1,                                                  level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',     qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',      level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',        qty: 1,                                                  level: 1, sequence: 15 },
          { part_number: 'PART-RD-UNIT',          qty: 1,                                                  level: 1, sequence: 16 },
        ],
      },

      // ── VOWHME2026 ───────────────────────────────────────
      {
        bom_number:   'BOM - VOWHME2026 - V1',
        parent_part:  'VOWHME2026',
        description:  'VOLT ROYAL WHITE GEN 2026 — Main BOM',
        notes:        'Main BOM for Volt Royal White Gen 2026',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-VC',        qty: 1, child_bom: 'BOM - PART-FRAME-VC - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-26',       qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-26 - V1',       level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-26', qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-26 - V1', level: 1, sequence: 3  },
          { part_number: 'PART-FORK-26',          qty: 1, child_bom: 'BOM - PART-FORK-26 - V1',          level: 1, sequence: 4  },
          { part_number: 'PART-BATT-48V',         qty: 1, child_bom: 'BOM - PART-BATT-48V - V1',         level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-48V',   qty: 1,                                                  level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',        qty: 1,                                                  level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',           qty: 1,                                                  level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',        qty: 1,                                                  level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',            qty: 1,                                                  level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',      qty: 1,                                                  level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',         qty: 1,                                                  level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',   qty: 1,                                                  level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',     qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',      level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',        qty: 1,                                                  level: 1, sequence: 15 },
          { part_number: 'PART-RD-UNIT',          qty: 1,                                                  level: 1, sequence: 16 },
        ],
      },

      // ══════════════════════════════════════════════════════
      // BOM PRODUK — ECO (6 varian: 3 warna × 2 generasi)
      // Single-speed: tidak ada PART-RD-UNIT & PART-FREEWHEEL
      // ══════════════════════════════════════════════════════

      // ── ECBKME2025 ───────────────────────────────────────
      {
        bom_number:   'BOM - ECBKME2025 - V1',
        parent_part:  'ECBKME2025',
        description:  'ECO STALLION BLACK GEN 2025 — Main BOM',
        notes:        'Main BOM for Eco Stallion Black Gen 2025',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-EF',         qty: 1, child_bom: 'BOM - PART-FRAME-EF - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-20',        qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-20 - V1',        level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-20',  qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-20 - V1',  level: 1, sequence: 3  },
          { part_number: 'PART-FORK-20',           qty: 1,                                                   level: 1, sequence: 4  },
          { part_number: 'PART-BATT-36V',          qty: 1, child_bom: 'BOM - PART-BATT-36V - V1',          level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-36V',    qty: 1,                                                   level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',         qty: 1,                                                   level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',            qty: 1,                                                   level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',         qty: 1,                                                   level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',             qty: 1,                                                   level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',       qty: 1,                                                   level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',          qty: 1,                                                   level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',    qty: 1,                                                   level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',      qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',       level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',         qty: 1,                                                   level: 1, sequence: 15 },
        ],
      },

      // ── ECGRME2025 ───────────────────────────────────────
      {
        bom_number:   'BOM - ECGRME2025 - V1',
        parent_part:  'ECGRME2025',
        description:  'ECO ARMOR GREY GEN 2025 — Main BOM',
        notes:        'Main BOM for Eco Armor Grey Gen 2025',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-EF',         qty: 1, child_bom: 'BOM - PART-FRAME-EF - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-20',        qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-20 - V1',        level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-20',  qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-20 - V1',  level: 1, sequence: 3  },
          { part_number: 'PART-FORK-20',           qty: 1,                                                   level: 1, sequence: 4  },
          { part_number: 'PART-BATT-36V',          qty: 1, child_bom: 'BOM - PART-BATT-36V - V1',          level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-36V',    qty: 1,                                                   level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',         qty: 1,                                                   level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',            qty: 1,                                                   level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',         qty: 1,                                                   level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',             qty: 1,                                                   level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',       qty: 1,                                                   level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',          qty: 1,                                                   level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',    qty: 1,                                                   level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',      qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',       level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',         qty: 1,                                                   level: 1, sequence: 15 },
        ],
      },

      // ── ECWHME2025 ───────────────────────────────────────
      {
        bom_number:   'BOM - ECWHME2025 - V1',
        parent_part:  'ECWHME2025',
        description:  'ECO ROYAL WHITE GEN 2025 — Main BOM',
        notes:        'Main BOM for Eco Royal White Gen 2025',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-EF',         qty: 1, child_bom: 'BOM - PART-FRAME-EF - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-20',        qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-20 - V1',        level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-20',  qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-20 - V1',  level: 1, sequence: 3  },
          { part_number: 'PART-FORK-20',           qty: 1,                                                   level: 1, sequence: 4  },
          { part_number: 'PART-BATT-36V',          qty: 1, child_bom: 'BOM - PART-BATT-36V - V1',          level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-36V',    qty: 1,                                                   level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',         qty: 1,                                                   level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',            qty: 1,                                                   level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',         qty: 1,                                                   level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',             qty: 1,                                                   level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',       qty: 1,                                                   level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',          qty: 1,                                                   level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',    qty: 1,                                                   level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',      qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',       level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',         qty: 1,                                                   level: 1, sequence: 15 },
        ],
      },

      // ── ECBKME2026 ───────────────────────────────────────
      {
        bom_number:   'BOM - ECBKME2026 - V1',
        parent_part:  'ECBKME2026',
        description:  'ECO STALLION BLACK GEN 2026 — Main BOM',
        notes:        'Main BOM for Eco Stallion Black Gen 2026',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-EF',         qty: 1, child_bom: 'BOM - PART-FRAME-EF - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-20',        qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-20 - V1',        level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-20',  qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-20 - V1',  level: 1, sequence: 3  },
          { part_number: 'PART-FORK-20',           qty: 1,                                                   level: 1, sequence: 4  },
          { part_number: 'PART-BATT-36V',          qty: 1, child_bom: 'BOM - PART-BATT-36V - V1',          level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-36V',    qty: 1,                                                   level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',         qty: 1,                                                   level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',            qty: 1,                                                   level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',         qty: 1,                                                   level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',             qty: 1,                                                   level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',       qty: 1,                                                   level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',          qty: 1,                                                   level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',    qty: 1,                                                   level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',      qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',       level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',         qty: 1,                                                   level: 1, sequence: 15 },
        ],
      },

      // ── ECGRME2026 ───────────────────────────────────────
      {
        bom_number:   'BOM - ECGRME2026 - V1',
        parent_part:  'ECGRME2026',
        description:  'ECO ARMOR GREY GEN 2026 — Main BOM',
        notes:        'Main BOM for Eco Armor Grey Gen 2026',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-EF',         qty: 1, child_bom: 'BOM - PART-FRAME-EF - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-20',        qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-20 - V1',        level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-20',  qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-20 - V1',  level: 1, sequence: 3  },
          { part_number: 'PART-FORK-20',           qty: 1,                                                   level: 1, sequence: 4  },
          { part_number: 'PART-BATT-36V',          qty: 1, child_bom: 'BOM - PART-BATT-36V - V1',          level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-36V',    qty: 1,                                                   level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',         qty: 1,                                                   level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',            qty: 1,                                                   level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',         qty: 1,                                                   level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',             qty: 1,                                                   level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',       qty: 1,                                                   level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',          qty: 1,                                                   level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',    qty: 1,                                                   level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',      qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',       level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',         qty: 1,                                                   level: 1, sequence: 15 },
        ],
      },

      // ── ECWHME2026 ───────────────────────────────────────
      {
        bom_number:   'BOM - ECWHME2026 - V1',
        parent_part:  'ECWHME2026',
        description:  'ECO ROYAL WHITE GEN 2026 — Main BOM',
        notes:        'Main BOM for Eco Royal White Gen 2026',
        bom_version:  1,
        details: [
          { part_number: 'PART-FRAME-EF',         qty: 1, child_bom: 'BOM - PART-FRAME-EF - V1',         level: 1, sequence: 1  },
          { part_number: 'ASSY-WHEEL-F-20',        qty: 1, child_bom: 'BOM - ASSY-WHEEL-F-20 - V1',        level: 1, sequence: 2  },
          { part_number: 'ASSY-WHEEL-R-MOTOR-20',  qty: 1, child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-20 - V1',  level: 1, sequence: 3  },
          { part_number: 'PART-FORK-20',           qty: 1,                                                   level: 1, sequence: 4  },
          { part_number: 'PART-BATT-36V',          qty: 1, child_bom: 'BOM - PART-BATT-36V - V1',          level: 1, sequence: 5  },
          { part_number: 'PART-CONTROLLER-36V',    qty: 1,                                                   level: 1, sequence: 6  },
          { part_number: 'PART-BRAKE-SET',         qty: 1,                                                   level: 1, sequence: 7  },
          { part_number: 'PART-SADDLE',            qty: 1,                                                   level: 1, sequence: 8  },
          { part_number: 'PART-PEDAL-SET',         qty: 1,                                                   level: 1, sequence: 9  },
          { part_number: 'PART-CHAIN',             qty: 1,                                                   level: 1, sequence: 10 },
          { part_number: 'PART-DISPLAY-LCD',       qty: 1,                                                   level: 1, sequence: 11 },
          { part_number: 'PART-THROTTLE',          qty: 1,                                                   level: 1, sequence: 12 },
          { part_number: 'PART-WIRING-HARNESS',    qty: 1,                                                   level: 1, sequence: 13 },
          { part_number: 'ASSY-HANDLEBAR-VC',      qty: 1, child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1',       level: 1, sequence: 14 },
          { part_number: 'PART-KICKSTAND',         qty: 1,                                                   level: 1, sequence: 15 },
        ],
      },
    ];

    // =====================================================
    // PASS 1 — INSERT BOM HEADERS
    // =====================================================

    const bomIdMap = {};

    for (const bomData of boms) {
      const existingBomId = await queryInterface.rawSelect(
        's_boms',
        { where: { bom_number: bomData.bom_number, deleted_at: null } },
        ['id']
      );

      let bomId = existingBomId;

      if (!existingBomId) {
        const parentPartId = getPartId(bomData.parent_part);

        if (!parentPartId) {
          console.warn(`[WARN] Parent part not found: ${bomData.parent_part}`);
          continue;
        }

        await queryInterface.bulkInsert('s_boms', [
          {
            bom_number:           bomData.bom_number,
            description:          bomData.description || null,
            parent_part_id:       parentPartId,
            notes:                bomData.notes || null,
            bom_version:          bomData.bom_version || 1,
            uom_id:               pcsUomId,
            doc_status_id:        approvedDocStatusId,
            activation_status_id: activeStatusId,
            reject_reason:        null,
            created_by:           null,
            approved_by:          null,
            approved_at:          now,
            activated_at:         now,
            created_at:           now,
            updated_at:           now,
            deleted_at:           null,
          },
        ]);

        bomId = await queryInterface.rawSelect(
          's_boms',
          { where: { bom_number: bomData.bom_number, deleted_at: null } },
          ['id']
        );
      }

      if (bomId) {
        bomIdMap[bomData.bom_number] = bomId;
      }
    }

    // =====================================================
    // PASS 2 — INSERT BOM DETAILS
    // =====================================================

    for (const bomData of boms) {
      const bomId = bomIdMap[bomData.bom_number];
      if (!bomId) continue;
      if (!bomData.details?.length) continue;

      for (const detail of bomData.details) {
        const partId   = getPartId(detail.part_number);
        const partType = getPartType(detail.part_number); // ← dari s_parts, bukan hardcode

        if (!partId) {
          console.warn(`[WARN] Part not found: ${detail.part_number}`);
          continue;
        }

        // Lookup child_bom_id
        let childBomId = null;
        if (detail.child_bom) {
          childBomId = bomIdMap[detail.child_bom] || null;
          if (!childBomId) {
            console.warn(`[WARN] Child BOM not found: ${detail.child_bom}`);
          }
        }

        // Guard: RAW tidak boleh punya child_bom
        if (partType === 'RAW' && childBomId) {
          console.warn(
            `[WARN] ${detail.part_number} adalah RAW — child_bom_id diabaikan`
          );
          childBomId = null;
        }

        const existingDetail = await queryInterface.rawSelect(
          's_bom_details',
          { where: { bom_id: bomId, part_id: partId, deleted_at: null } },
          ['id']
        );

        if (!existingDetail) {
          await queryInterface.bulkInsert('s_bom_details', [
            {
              bom_id:           bomId,
              part_id:          partId,
              qty_required:     detail.qty || 1,
              level:            detail.level || 1,
              sequence:         detail.sequence || 0,
              type:             partType,      // selalu sinkron dengan s_parts
              child_bom_id:     childBomId,
              uom_id:           pcsUomId,
              scrap_percentage: detail.scrap_percentage || 0,
              notes:            detail.notes || null,
              created_at:       now,
              updated_at:       now,
              deleted_at:       null,
            },
          ]);
        }
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_bom_details', null, {});
    await queryInterface.bulkDelete('s_boms', null, {});
  },
};