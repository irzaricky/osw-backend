/** @type {import('sequelize-cli').Migration} */
/**
 * Seed: s_part_suppliers
 *
 * Mapping berdasarkan spesialisasi supplier dari field `notes` di s_suppliers:
 *   Rangka & Logam       : S001, S006, S010, S017, S019, S020
 *   Baterai & Elektronik : S002, S003, S007, S008, S009, S011, S014, S015
 *   Baut & Bearing       : S004, S005, S012, S013
 *   Ban & Karet          : S016, S018
 *
 * Logika per part:
 *   - PART/ASSY berbahan logam/rangka  → supplier Rangka & Logam
 *   - PART baterai/elektronik/motor    → supplier Baterai & Elektronik
 *   - PART bearing/baut/drivetrain     → supplier Baut & Bearing
 *   - PART ban/karet/grip              → supplier Ban & Karet
 *   - Assembly gabungan (wheel+motor)  → supplier utama sesuai komponen dominan
 *     + supplier sekunder dari kategori pendukung
 *
 * Primary (is_primary=true): supplier paling relevan berdasarkan spesialisasi.
 * Setiap part punya 2-3 supplier agar ada pilihan di form MPO.
 */
export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const [partRows] = await queryInterface.sequelize.query(
      `SELECT id, part_number FROM s_parts WHERE deleted_at IS NULL;`
    );
    const partMap = Object.fromEntries(partRows.map(r => [r.part_number, r.id]));

    const [supplierRows] = await queryInterface.sequelize.query(
      `SELECT id, supplier_code FROM s_suppliers WHERE deleted_at IS NULL;`
    );
    const sup = Object.fromEntries(supplierRows.map(r => [r.supplier_code, r.id]));

    // Helper: { code, primary }
    const p = (code) => ({ code, primary: true });
    const a = (code) => ({ code, primary: false });

    const mappings = [

      // ════════════════════════════════════════════════════════
      // RANGKA & LOGAM
      // Supplier: S001 Accelerated, S006 Astra Otoparts,
      //           S010 Daijo, S017 Elesun, S019 Garuda Metalindo,
      //           S020 Garuda Metal Utama
      // ════════════════════════════════════════════════════════

      // Frame — Elesun spesialis frame baru, Garuda & Astra sebagai alternatif
      { pn: 'PART-FRAME-VC',
        s: [p('S017'), a('S019'), a('S006')] },
      { pn: 'PART-FRAME-EF',
        s: [p('S017'), a('S020'), a('S001')] },

      // Fork — Garuda Metalindo primary (rangka presisi), Daijo alternatif
      { pn: 'PART-FORK-26',
        s: [p('S019'), a('S010'), a('S006')] },
      { pn: 'PART-FORK-20',
        s: [p('S019'), a('S010'), a('S006')] },

      // Seatpost — logam tubular, Accelerated primary, Garuda alternatif
      { pn: 'PART-SEATPOST',
        s: [p('S001'), a('S019'), a('S020')] },

      // Axle — logam presisi, Garuda Metal Utama primary, Daijo alternatif
      { pn: 'PART-AXLE-F',
        s: [p('S020'), a('S010'), a('S001')] },
      { pn: 'PART-AXLE-R',
        s: [p('S020'), a('S010'), a('S001')] },

      // Kickstand — logam ringan, Daijo primary (besi/stamping), Astra alternatif
      { pn: 'PART-KICKSTAND',
        s: [p('S010'), a('S006'), a('S020')] },

      // Stem handlebar — logam presisi pendek, Astra Otoparts primary
      { pn: 'PART-STEM',
        s: [p('S006'), a('S019'), a('S001')] },

      // Seat post clamp — besi kecil/stamping, Astra Otoparts & Daijo
      { pn: 'PART-SEAT-CLAMP',
        s: [p('S006'), a('S010')] },

      // Rim — logam alloy, Astra Otoparts primary, Garuda Metalindo alternatif
      { pn: 'PART-RIM-26',
        s: [p('S006'), a('S019'), a('S020')] },
      { pn: 'PART-RIM-20',
        s: [p('S006'), a('S019'), a('S020')] },

      // Spoke — logam tipis/stainless, Accelerated primary, Astra Otoparts alternatif
      { pn: 'PART-SPOKE-SS',
        s: [p('S001'), a('S006'), a('S019')] },

      // RD Hanger — logam kecil presisi, Daijo primary
      { pn: 'PART-RD-HANGER',
        s: [p('S010'), a('S020'), a('S006')] },

      // ════════════════════════════════════════════════════════
      // BATERAI & ELEKTRONIK
      // Supplier: S002 Akebono, S003 Asianet, S007 Cable Tech,
      //           S008 Changzhou Depu, S009 Changzhou Wujin,
      //           S011 Dharma Electrindo, S014 Dongguan Tianrui,
      //           S015 Dongguan Zhuoshi
      // ════════════════════════════════════════════════════════

      // Battery pack — Akebono & Asianet spesialis baterai lokal
      { pn: 'PART-BATT-48V',
        s: [p('S002'), a('S003'), a('S008')] },
      { pn: 'PART-BATT-36V',
        s: [p('S002'), a('S003'), a('S009')] },

      // Battery case — plastik elektronik, Changzhou Depu & Dongguan Tianrui
      { pn: 'PART-BATT-CASE',
        s: [p('S008'), a('S014'), a('S015')] },

      // BMS PCB — elektronik presisi, Dharma Electrindo primary (lokal)
      { pn: 'PART-BMS-48V',
        s: [p('S011'), a('S009'), a('S014')] },
      { pn: 'PART-BMS-36V',
        s: [p('S011'), a('S009'), a('S014')] },

      // Li Cell — sel baterai, Asianet primary, Dongguan sebagai alternatif impor
      { pn: 'PART-CELL-18650',
        s: [p('S003'), a('S014'), a('S015')] },

      // Controller — elektronik daya, Cable Tech primary, Dharma Electrindo alternatif
      { pn: 'PART-CONTROLLER-48V',
        s: [p('S007'), a('S011'), a('S008')] },
      { pn: 'PART-CONTROLLER-36V',
        s: [p('S007'), a('S011'), a('S009')] },

      // LCD Dashboard — elektronik display, Dongguan Tianrui & Zhuoshi spesialis
      { pn: 'PART-DISPLAY-LCD',
        s: [p('S014'), a('S015'), a('S011')] },

      // Wiring Harness — kabel rakitan, Cable Tech primary
      { pn: 'PART-WIRING-HARNESS',
        s: [p('S007'), a('S011'), a('S009')] },

      // Throttle — elektronik grip, Changzhou Wujin & Dongguan
      { pn: 'PART-THROTTLE',
        s: [p('S009'), a('S015'), a('S007')] },

      // Hub Motor — motor listrik, Changzhou Depu & Zhuoshi spesialis motor
      { pn: 'ASSY-MOTOR-HUB-48V',
        s: [p('S008'), a('S015'), a('S014')] },
      { pn: 'ASSY-MOTOR-HUB-36V',
        s: [p('S008'), a('S015'), a('S014')] },

      // Rear Motor Wheel — dominan komponen motor + logam roda
      // primary: Changzhou Depu (motor), alternatif: Dongguan Zhuoshi (motor), Elesun (logam wheel)
      { pn: 'ASSY-WHEEL-R-MOTOR-26',
        s: [p('S008'), a('S015'), a('S017')] },
      { pn: 'ASSY-WHEEL-R-MOTOR-20',
        s: [p('S008'), a('S015'), a('S017')] },

      // ════════════════════════════════════════════════════════
      // BAUT & BEARING
      // Supplier: S004 Astra Komponen, S005 Astra Otoparts Nusametal,
      //           S012 Dharma Polimetal, S013 Dharma Poliplast
      // ════════════════════════════════════════════════════════

      // Ball Bearing — Astra Komponen primary, Dharma Polimetal alternatif
      { pn: 'PART-BEARING-608',
        s: [p('S004'), a('S012'), a('S005')] },

      // Flange Nut — Astra Otoparts Nusametal (stamping/fastener), Dharma Poliplast
      { pn: 'PART-NUT-M12',
        s: [p('S005'), a('S013'), a('S004')] },

      // Headset bearing — Astra Komponen primary
      { pn: 'PART-HEADSET',
        s: [p('S004'), a('S012'), a('S005')] },

      // Hub F — bearing & logam, Astra Komponen primary
      { pn: 'ASSY-HUB-F',
        s: [p('S004'), a('S005'), a('S012')] },

      // Pedal & Crank — Nusametal (stamping logam), Astra Komponen
      { pn: 'PART-PEDAL-SET',
        s: [p('S005'), a('S004'), a('S012')] },

      // Chain — Nusametal & Polimetal (logam presisi)
      { pn: 'PART-CHAIN',
        s: [p('S005'), a('S012'), a('S004')] },

      // Freewheel — ratchet mekanis, Astra Komponen primary
      { pn: 'PART-FREEWHEEL',
        s: [p('S004'), a('S005'), a('S012')] },

      // Rear Derailleur — mekanis presisi, Astra Komponen & Nusametal
      { pn: 'PART-RD-UNIT',
        s: [p('S004'), a('S005'), a('S013')] },

      // Brake Set — mekanis disc, Astra Otoparts primary, Nusametal alternatif
      { pn: 'PART-BRAKE-SET',
        s: [p('S006'), a('S005'), a('S004')] },

      // ════════════════════════════════════════════════════════
      // BAN & KARET
      // Supplier: S016 Efata Mitra, S018 Fuji Seimitsu
      // ════════════════════════════════════════════════════════

      // Tire — ban luar, Efata Mitra primary, Fuji Seimitsu alternatif
      { pn: 'PART-TIRE-26',
        s: [p('S016'), a('S018')] },
      { pn: 'PART-TIRE-20',
        s: [p('S016'), a('S018')] },

      // Rubber Hand Grip — karet, Fuji Seimitsu primary, Efata alternatif
      { pn: 'PART-GRIP-RUBBER',
        s: [p('S018'), a('S016')] },

      // Saddle — busa/karet+logam, Fuji Seimitsu (karet) primary, Astra Otoparts (rangka) alternatif
      { pn: 'PART-SADDLE',
        s: [p('S018'), a('S016'), a('S006')] },

      // ════════════════════════════════════════════════════════
      // ASSEMBLY CAMPURAN (logam + komponen)
      // ════════════════════════════════════════════════════════

      // Handlebar Set — logam tubing + grip, Elesun (logam) primary, Astra Otoparts alternatif
      { pn: 'ASSY-HANDLEBAR-VC',
        s: [p('S017'), a('S006'), a('S001')] },

      // Front Wheel Assy — logam (rim+spoke+hub), Elesun primary, Garuda Metalindo alternatif
      { pn: 'ASSY-WHEEL-F-26',
        s: [p('S017'), a('S019'), a('S006')] },
      { pn: 'ASSY-WHEEL-F-20',
        s: [p('S017'), a('S019'), a('S006')] },
    ];

    // ─── Build rows ──────────────────────────────────────────────────────────
    const rows = [];
    const primaryUpdates = [];

    for (const m of mappings) {
      const partId = partMap[m.pn];
      if (!partId) {
        console.warn(`[WARN] Part tidak ditemukan di DB: ${m.pn}`);
        continue;
      }
      for (const s of m.s) {
        const supplierId = sup[s.code];
        if (!supplierId) {
          console.warn(`[WARN] Supplier tidak ditemukan: ${s.code}`);
          continue;
        }
        rows.push({
          part_id: partId,
          supplier_id: supplierId,
          is_primary: s.primary,
          created_at: now,
          updated_at: now,
        });
        if (s.primary) {
          primaryUpdates.push({ partId, supplierId });
        }
      }
    }

    // Update supplier_id di s_parts (legacy field) dengan supplier primary
    for (const { partId, supplierId } of primaryUpdates) {
      await queryInterface.sequelize.query(
        `UPDATE s_parts SET supplier_id = ${supplierId} WHERE id = ${partId} AND deleted_at IS NULL;`
      );
    }

    await queryInterface.bulkInsert('s_part_suppliers', rows, { ignoreDuplicates: true });
    console.log(`[SEED] ${rows.length} part-supplier mapping inserted.`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('s_part_suppliers', null, {});
    await queryInterface.sequelize.query(
      `UPDATE s_parts SET supplier_id = NULL WHERE deleted_at IS NULL;`
    );
  },
};