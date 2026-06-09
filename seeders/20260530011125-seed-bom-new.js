/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // Reset Sequence Auto-Increment demi keamanan PostgreSQL
    try {
      await queryInterface.sequelize.query(`
        SELECT setval('s_boms_id_seq', COALESCE((SELECT MAX(id) FROM s_boms), 1), true);
        SELECT setval('s_bom_details_id_seq', COALESCE((SELECT MAX(id) FROM s_bom_details), 1), true);
      `);
    } catch (e) {
      // Abaikan jika sequence tidak ada
    }

    // =========================================================
    // 1. Bersihkan Data Lama (Hapus Detail Dulu Baru Header)
    // =========================================================
    console.log('Clearing old BOM data...');
    await queryInterface.bulkDelete('s_bom_details', null, {});
    await queryInterface.bulkDelete('s_boms', null, {});

    // =========================================================
    // 2. Ambil referensi dari s_parts untuk mapping code -> id & uom_id
    // =========================================================
    const [partRows] = await queryInterface.sequelize.query(`
      SELECT
        id,
        part_number,
        uom_id,
        part_type_code
      FROM s_parts
      WHERE deleted_at IS NULL;
    `);
    
    const partMap = Object.fromEntries(
      partRows.map((r) => [
        r.part_number,
        {
          id: r.id,
          uom_id: r.uom_id,
          part_type_code: r.part_type_code
        }
      ])
    );

    // =========================================================
    // 3. Definisikan Produk Utama & Komponen-Komponennya
    // =========================================================
    const voltProducts = [
      'VOBKME2025', 'VOGRME2025', 'VOWHME2025',
      'VOBKME2026', 'VOGRME2026', 'VOWHME2026'
    ];

    const ecoProducts = [
      'ECBKME2025', 'ECGRME2025', 'ECWHME2025',
      'ECBKME2026', 'ECGRME2026', 'ECWHME2026'
    ];

    const voltComponents = [
      { code: 'ASSY-WHEEL-F-26', qty: 1, level: 1 },
      { code: 'ASSY-WHEEL-R-MOTOR-26', qty: 1, level: 1 },
      { code: 'ASSY-HANDLEBAR-VC', qty: 1, level: 1 },
      { code: 'PART-FRAME-VC', qty: 1, level: 1 },
      { code: 'PART-FORK-26', qty: 1, level: 1 },
      { code: 'PART-BATT-48V', qty: 1, level: 1 },
      { code: 'PART-CONTROLLER-48V', qty: 1, level: 1 },
      { code: 'PART-BRAKE-SET', qty: 1, level: 1 },
      { code: 'PART-SADDLE', qty: 1, level: 1 },
      { code: 'PART-SEAT-CLAMP', qty: 1, level: 1 },
      { code: 'PART-PEDAL-SET', qty: 1, level: 1 },
      { code: 'PART-CHAIN', qty: 1, level: 1 },
      { code: 'PART-DISPLAY-LCD', qty: 1, level: 1 },
      { code: 'PART-THROTTLE', qty: 1, level: 1 },
      { code: 'PART-WIRING-HARNESS', qty: 1, level: 1 },
      { code: 'PART-KICKSTAND', qty: 1, level: 1 },
      { code: 'PART-RD-UNIT', qty: 1, level: 1 },
      { code: 'PART-RD-HANGER', qty: 1, level: 1 },
      { code: 'PART-HEADSET', qty: 1, level: 1 },
      { code: 'PART-SEATPOST', qty: 1, level: 1 },
    ];

    const ecoComponents = [
      { code: 'ASSY-WHEEL-F-20', qty: 1, level: 1 },
      { code: 'ASSY-WHEEL-R-MOTOR-20', qty: 1, level: 1 },
      { code: 'ASSY-HANDLEBAR-VC', qty: 1, level: 1 },
      { code: 'PART-FRAME-EF', qty: 1, level: 1 },
      { code: 'PART-FORK-20', qty: 1, level: 1 },
      { code: 'PART-BATT-36V', qty: 1, level: 1 },
      { code: 'PART-CONTROLLER-36V', qty: 1, level: 1 },
      { code: 'PART-BRAKE-SET', qty: 1, level: 1 },
      { code: 'PART-SADDLE', qty: 1, level: 1 },
      { code: 'PART-SEAT-CLAMP', qty: 1, level: 1 },
      { code: 'PART-PEDAL-SET', qty: 1, level: 1 },
      { code: 'PART-CHAIN', qty: 1, level: 1 },
      { code: 'PART-DISPLAY-LCD', qty: 1, level: 1 },
      { code: 'PART-THROTTLE', qty: 1, level: 1 },
      { code: 'PART-WIRING-HARNESS', qty: 1, level: 1 },
      { code: 'PART-KICKSTAND', qty: 1, level: 1 },
      { code: 'PART-RD-UNIT', qty: 1, level: 1 },
      { code: 'PART-RD-HANGER', qty: 1, level: 1 },
      { code: 'PART-HEADSET', qty: 1, level: 1 },
      { code: 'PART-SEATPOST', qty: 1, level: 1 },
    ];

    // Struktur BOM untuk Sub-Assembly (Multi-level)
    const subAssemblies = {
      'ASSY-WHEEL-F-26': [
        { code: 'PART-TIRE-26', qty: 1, level: 2 },
        { code: 'PART-RIM-26', qty: 1, level: 2 },
        { code: 'PART-SPOKE-SS', qty: 36, level: 2 },
        { code: 'ASSY-HUB-F', qty: 1, level: 2 },
        { code: 'PART-NUT-M12', qty: 2, level: 2 },
      ],
      'ASSY-WHEEL-F-20': [
        { code: 'PART-TIRE-20', qty: 1, level: 2 },
        { code: 'PART-RIM-20', qty: 1, level: 2 },
        { code: 'PART-SPOKE-SS', qty: 36, level: 2 },
        { code: 'ASSY-HUB-F', qty: 1, level: 2 },
        { code: 'PART-NUT-M12', qty: 2, level: 2 },
      ],
      'ASSY-WHEEL-R-MOTOR-26': [
        { code: 'PART-TIRE-26', qty: 1, level: 2 },
        { code: 'PART-RIM-26', qty: 1, level: 2 },
        { code: 'PART-SPOKE-SS', qty: 36, level: 2 },
        { code: 'ASSY-MOTOR-HUB-48V', qty: 1, level: 2 },
        { code: 'PART-FREEWHEEL', qty: 1, level: 2 },
        { code: 'PART-NUT-M12', qty: 2, level: 2 },
      ],
      'ASSY-WHEEL-R-MOTOR-20': [
        { code: 'PART-TIRE-20', qty: 1, level: 2 },
        { code: 'PART-RIM-20', qty: 1, level: 2 },
        { code: 'PART-SPOKE-SS', qty: 36, level: 2 },
        { code: 'ASSY-MOTOR-HUB-36V', qty: 1, level: 2 },
        { code: 'PART-FREEWHEEL', qty: 1, level: 2 },
        { code: 'PART-NUT-M12', qty: 2, level: 2 },
      ],
      'ASSY-HANDLEBAR-VC': [
        { code: 'PART-STEM', qty: 1, level: 2 },
        { code: 'PART-GRIP-RUBBER', qty: 2, level: 2 },
      ],
      'ASSY-HUB-F': [
        { code: 'PART-AXLE-F', qty: 1, level: 3 },
        { code: 'PART-BEARING-608', qty: 2, level: 3 },
      ],
      'ASSY-MOTOR-HUB-48V': [
        { code: 'PART-AXLE-R', qty: 1, level: 3 },
        { code: 'PART-BEARING-608', qty: 2, level: 3 },
      ],
      'ASSY-MOTOR-HUB-36V': [
        { code: 'PART-AXLE-R', qty: 1, level: 3 },
        { code: 'PART-BEARING-608', qty: 2, level: 3 },
      ],
      'PART-BATT-48V': [
        { code: 'PART-BATT-CASE', qty: 1, level: 2 },
        { code: 'PART-BMS-48V', qty: 1, level: 2 },
        { code: 'PART-CELL-18650', qty: 52, level: 2 },
      ],
      'PART-BATT-36V': [
        { code: 'PART-BATT-CASE', qty: 1, level: 2 },
        { code: 'PART-BMS-36V', qty: 1, level: 2 },
        { code: 'PART-CELL-18650', qty: 40, level: 2 },
      ]
    };

    // =========================================================
    // 4. Proses Pembuatan Data Header BOM (s_boms)
    // =========================================================
    const headerInserts = [];
    let bomCounter = 1;

    const createBomHeader = (parentCode) => {
      const parentData = partMap[parentCode];
      if (!parentData) return null;

      const codeString = String(bomCounter++).padStart(3, '0');
      return {
        bom_number: `BOM-${parentCode}-${codeString}`,
        description: `BOM Standar Manufaktur untuk ${parentCode}`,
        parent_part_id: parentData.id,
        notes: `Seeder otomatis produksi untuk item tipe ${parentCode}`,
        bom_version: 1,
        uom_id: parentData.uom_id,
        doc_status:        'Approved',
        activation_status: 'Active',
        reject_reason: null,
        created_by: 1,            // Diarahkan ke user id administrator 1
        approved_by: 1,           // Disetujui oleh user id 1
        approved_at: now,         // Waktu persetujuan terisi
        activated_at: now,        // Waktu aktivasi terisi
        created_at: now,
        updated_at: now,
        deleted_at: null
      };
    };

    const parentToBomDetailsMap = [];

    // Loop produk utama VOLT
    for (const prod of voltProducts) {
      const header = createBomHeader(prod);
      if (header) {
        headerInserts.push(header);
        parentToBomDetailsMap.push({ bomCode: header.bom_number, components: voltComponents });
      }
    }

    // Loop produk utama ECO
    for (const prod of ecoProducts) {
      const header = createBomHeader(prod);
      if (header) {
        headerInserts.push(header);
        parentToBomDetailsMap.push({ bomCode: header.bom_number, components: ecoComponents });
      }
    }

    // Loop produk Sub-Assembly
    for (const parentCode of Object.keys(subAssemblies)) {
      const header = createBomHeader(parentCode);
      if (header) {
        headerInserts.push(header);
        parentToBomDetailsMap.push({ bomCode: header.bom_number, components: subAssemblies[parentCode] });
      }
    }

    if (headerInserts.length === 0) {
      console.error('[ERROR] Tidak ada data BOM Header yang valid.');
      return;
    }
    
    await queryInterface.bulkInsert('s_boms', headerInserts);
    console.log(`[SUCCESS] Berhasil memasukkan ${headerInserts.length} record ke tabel s_boms.`);

    // =========================================================
    // 5. Ambil Map ID Header dan Map Komponen Sub-Assembly untuk Child BOM
    // =========================================================
    const [insertedBoms] = await queryInterface.sequelize.query(
      `SELECT id, bom_number, parent_part_id FROM s_boms;`
    );
    
    // Mapping bom_number ke id header BOM
    const bomIdMap = Object.fromEntries(insertedBoms.map(b => [b.bom_number, b.id]));
    
    // Mapping parent_part_id ke id header BOM (Digunakan untuk mencari child_bom_id secara dinamis)
    const partIdToBomIdMap = Object.fromEntries(insertedBoms.map(b => [b.parent_part_id, b.id]));

    // =========================================================
    // 6. Proses Pembuatan Data Komponen Komplit (s_bom_details)
    // =========================================================
    const detailInserts = [];

    for (const group of parentToBomDetailsMap) {
      const bomId = bomIdMap[group.bomCode];
      let seqCounter = 1;

      for (const comp of group.components) {
        const compData = partMap[comp.code];

        if (!compData) {
          console.warn(`[WARN] Komponen '${comp.code}' tidak ditemukan di tabel s_parts.`);
          continue;
        }

        // MENCARI CHILD BOM ID: Jika komponen ini sendiri memiliki struktur BOM (sub-assembly),
        // maka kaitkan ID BOM miliknya ke kolom child_bom_id. Jika raw material biasa, isi null.
        const childBomId = partIdToBomIdMap[compData.id] || null;

        const allowedTypes = ['RAW', 'WIP', 'PRODUCT'];

        if (!allowedTypes.includes(compData.part_type_code)) {
          console.warn(
            `[WARN] Part '${comp.code}' memiliki type '${compData.part_type_code}' yang tidak valid`
          );
          continue;
        }

        detailInserts.push({
          bom_id: bomId,
          part_id: compData.id,
          qty_required: comp.qty,
          level: comp.level,                            // Mengisi kolom level (1, 2, atau 3)
          type: compData.part_type_code,                              // Mengisi kolom type ('Component' / 'Raw Material')
          notes: `Bahan baku operasional untuk ${group.bomCode}`,
          uom_id: compData.uom_id,                      // Mengikuti UOM part bawaan komponen
          scrap_percentage: 0.00,                       // Default scrap 0.00%
          sequence: seqCounter++,                       // Mengisi nomor urut material baris produksi (1, 2, 3...)
          child_bom_id: childBomId,                     // MENGISI RELASI MULTI-LEVEL SUB-ASSEMBLY
          created_at: now,
          updated_at: now,
          deleted_at: null
        });
      }
    }

    if (detailInserts.length > 0) {
      await queryInterface.bulkInsert('s_bom_details', detailInserts);
      console.log(`[SUCCESS] Berhasil memasukkan ${detailInserts.length} item komponen komplit (Approved & Active) ke s_bom_details.`);
    } else {
      console.error('[ERROR] Tidak ada komponen BOM Detail yang berhasil dimasukkan.');
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('s_bom_details', null, {});
    await queryInterface.bulkDelete('s_boms', null, {});
  },
};