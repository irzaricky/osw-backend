/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const timestamp = { created_at: now, updated_at: now };

    // ============================================================
    // HELPER: ambil ID dari DB agar tidak hardcode
    // ============================================================
    const getUser = async (email) => {
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_users WHERE email = '${email}' LIMIT 1`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return result[0]?.id || null;
    };

    const getPart = async (partNumber) => {
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_parts WHERE part_number = '${partNumber}' LIMIT 1`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return result[0]?.id || null;
    };

    const getBom = async (bomNumber) => {
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_boms WHERE bom_number = '${bomNumber}' LIMIT 1`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return result[0]?.id || null;
    };

    const getSupplier = async (code) => {
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_suppliers WHERE supplier_code = '${code}' LIMIT 1`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return result[0]?.id || null;
    };

    const getWarehouse = async (code) => {
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_warehouses WHERE warehouse_code = '${code}' LIMIT 1`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return result[0]?.id || null;
    };

    const getDock = async (code) => {
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_docks WHERE dock_code = '${code}' LIMIT 1`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return result[0]?.id || null;
    };

    // ============================================================
    // RESOLVE IDs dari data master yang sudah ada
    // ============================================================
    const staffId = await getUser('taufik.hidayat@company.com');     // Admin PPIC → maker
    const supervisorId = await getUser('rahmi.wastuti@company.com');     // Supervisor PPIC → checker/approver

    const partSeatpost = await getPart('PART-SEATPOST');
    const partBattCase = await getPart('PART-BATT-CASE');
    const partBms48v = await getPart('PART-BMS-48V');
    const partCell18650 = await getPart('PART-CELL-18650');
    const partRim26 = await getPart('PART-RIM-26');
    const partTire26 = await getPart('PART-TIRE-26');
    const partSpokeSs = await getPart('PART-SPOKE-SS');
    const partNutM12 = await getPart('PART-NUT-M12');
    const partBearingAlt = await getPart('PART-BEARING-608');

    const bomVoltStallion = await getBom('BOM - VOBKME2025 - V1');
    const bomFrameVc = await getBom('BOM - PART-FRAME-VC - V1');
    const bomWheelF26 = await getBom('BOM - ASSY-WHEEL-F-26 - V1');

    const supplierId1 = await getSupplier('S001'); // Rangka & Logam
    const supplierId2 = await getSupplier('S002'); // Baterai & Elektronik
    const supplierId4 = await getSupplier('S004'); // Baut & Bearing

    const warehouseId = await getWarehouse('WH-MAT-01');
    const dockId1 = await getDock('DCK-01');
    const dockId3 = await getDock('DCK-03');

    // ============================================================
    // 1. MRP
    // Skenario: 3 dokumen MRP dengan status berbeda
    // production_plan_id = null karena tabel s_production_plans belum di-migrate
    // ============================================================
    const mrpData = [
      {
        production_plan_id: null,
        number: 'MRP-2026-05-001',
        description: 'MRP Produksi Volt Stallion Mei 2026',
        status: 'approved',
        created_by: staffId,
        approved_by: supervisorId,
        ...timestamp
      },
      {
        production_plan_id: null,
        number: 'MRP-2026-06-001',
        description: 'MRP Produksi Volt Stallion Juni 2026',
        status: 'submitted',
        created_by: staffId,
        approved_by: null,
        ...timestamp
      },
      {
        production_plan_id: null,
        number: 'MRP-2026-06-002',
        description: 'MRP Produksi EcoFold Juni 2026',
        status: 'draft',
        created_by: staffId,
        approved_by: null,
        ...timestamp
      },
    ];

    await queryInterface.bulkInsert('s_mrps', mrpData, {});

    // Ambil ID MRP yang baru diinsert
    const mrps = await queryInterface.sequelize.query(
      `SELECT id, number FROM s_mrps WHERE number IN ('MRP-2026-05-001','MRP-2026-06-001','MRP-2026-06-002') ORDER BY id ASC`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const mrpMap = Object.fromEntries(mrps.map(m => [m.number, m.id]));

    // Reset sequence PostgreSQL
    if (queryInterface.sequelize.options.dialect === 'postgres') {
      await queryInterface.sequelize.query(`SELECT setval('s_mrps_id_seq', (SELECT MAX(id) FROM s_mrps));`);
    }

    // ============================================================
    // 2. MRP DETAILS
    // Hanya untuk MRP-2026-05-001 (approved) dan MRP-2026-06-001 (submitted)
    // ============================================================
    const mrpDetailData = [
      // MRP-2026-05-001 details
      { mrp_id: mrpMap['MRP-2026-05-001'], part_id: partSeatpost, bom_id: bomFrameVc, qty: 50, notes: 'Kebutuhan seatpost', ...timestamp },
      { mrp_id: mrpMap['MRP-2026-05-001'], part_id: partBms48v, bom_id: bomVoltStallion, qty: 50, notes: 'BMS 48V untuk baterai', ...timestamp },
      { mrp_id: mrpMap['MRP-2026-05-001'], part_id: partBattCase, bom_id: bomVoltStallion, qty: 50, notes: null, ...timestamp },
      { mrp_id: mrpMap['MRP-2026-05-001'], part_id: partCell18650, bom_id: bomVoltStallion, qty: 3000, notes: '60 cell per baterai x 50', ...timestamp },
      { mrp_id: mrpMap['MRP-2026-05-001'], part_id: partTire26, bom_id: bomWheelF26, qty: 100, notes: 'x2 per unit', ...timestamp },
      { mrp_id: mrpMap['MRP-2026-05-001'], part_id: partSpokeSs, bom_id: bomWheelF26, qty: 1800, notes: '36 spoke per roda x 2 roda x 25 unit', ...timestamp },
      { mrp_id: mrpMap['MRP-2026-05-001'], part_id: partNutM12, bom_id: bomWheelF26, qty: 200, notes: null, ...timestamp },

      // MRP-2026-06-001 details
      { mrp_id: mrpMap['MRP-2026-06-001'], part_id: partSeatpost, bom_id: bomFrameVc, qty: 75, notes: 'Target produksi meningkat Juni', ...timestamp },
      { mrp_id: mrpMap['MRP-2026-06-001'], part_id: partRim26, bom_id: bomWheelF26, qty: 150, notes: null, ...timestamp },
      { mrp_id: mrpMap['MRP-2026-06-001'], part_id: partTire26, bom_id: bomWheelF26, qty: 150, notes: null, ...timestamp },
      { mrp_id: mrpMap['MRP-2026-06-001'], part_id: partBearingAlt, bom_id: null, qty: 300, notes: 'Safety stock bearing', ...timestamp },
    ].filter(d => d.part_id);

    await queryInterface.bulkInsert('s_mrp_details', mrpDetailData, {});

    // ============================================================
    // 3. MATERIAL PURCHASE REQUESTS (MPR)
    // Skenario: 4 PR dengan status berbeda
    // - 2 PR auto dari MRP (approved)
    // - 1 PR emergency (manual, tanpa MRP)
    // - 1 PR masih draft
    // ============================================================
    const mprData = [
      {
        mrp_id: mrpMap['MRP-2026-05-001'],
        number: 'MPR-2026-05-001',
        description: 'Purchase Request Baterai & Frame Mei 2026',
        request_date: new Date('2026-05-01'),
        type: 'auto',
        status: 'approved',
        remarks: 'Disetujui sesuai kebutuhan produksi',
        created_by: staffId,
        approved_by: supervisorId,
        ...timestamp
      },
      {
        mrp_id: mrpMap['MRP-2026-05-001'],
        number: 'MPR-2026-05-002',
        description: 'Purchase Request Komponen Roda Mei 2026',
        request_date: new Date('2026-05-03'),
        type: 'auto',
        status: 'approved',
        remarks: null,
        created_by: staffId,
        approved_by: supervisorId,
        ...timestamp
      },
      {
        mrp_id: null,
        number: 'MPR-2026-05-003',
        description: 'Emergency PR - Bearing 608 Rusak',
        request_date: new Date('2026-05-10'),
        type: 'manual',
        status: 'submitted',
        remarks: 'Bearing rusak mendadak, butuh penggantian segera',
        created_by: staffId,
        approved_by: null,
        ...timestamp
      },
      {
        mrp_id: mrpMap['MRP-2026-06-001'],
        number: 'MPR-2026-06-001',
        description: 'Purchase Request Juni 2026 - Draft',
        request_date: new Date('2026-06-01'),
        type: 'auto',
        status: 'draft',
        remarks: null,
        created_by: staffId,
        approved_by: null,
        ...timestamp
      },
    ];

    await queryInterface.bulkInsert('s_material_purchase_requests', mprData, {});

    const mprs = await queryInterface.sequelize.query(
      `SELECT id, number FROM s_material_purchase_requests WHERE number IN ('MPR-2026-05-001','MPR-2026-05-002','MPR-2026-05-003','MPR-2026-06-001') ORDER BY id ASC`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const mprMap = Object.fromEntries(mprs.map(m => [m.number, m.id]));

    if (queryInterface.sequelize.options.dialect === 'postgres') {
      await queryInterface.sequelize.query(`SELECT setval('s_material_purchase_requests_id_seq', (SELECT MAX(id) FROM s_material_purchase_requests));`);
    }

    // ============================================================
    // 4. MPR DETAILS
    // ============================================================
    const mprDetailData = [
      // MPR-2026-05-001: Material Baterai & Rangka
      { mpr_id: mprMap['MPR-2026-05-001'], part_id: partSeatpost, qty: 50, required_date: new Date('2026-05-15'), notes: null, ...timestamp },
      { mpr_id: mprMap['MPR-2026-05-001'], part_id: partBms48v, qty: 50, required_date: new Date('2026-05-15'), notes: 'Prioritas tinggi', ...timestamp },
      { mpr_id: mprMap['MPR-2026-05-001'], part_id: partBattCase, qty: 50, required_date: new Date('2026-05-15'), notes: null, ...timestamp },
      { mpr_id: mprMap['MPR-2026-05-001'], part_id: partCell18650, qty: 3000, required_date: new Date('2026-05-20'), notes: null, ...timestamp },

      // MPR-2026-05-002: Komponen Roda
      { mpr_id: mprMap['MPR-2026-05-002'], part_id: partTire26, qty: 100, required_date: new Date('2026-05-18'), notes: null, ...timestamp },
      { mpr_id: mprMap['MPR-2026-05-002'], part_id: partSpokeSs, qty: 1800, required_date: new Date('2026-05-18'), notes: null, ...timestamp },
      { mpr_id: mprMap['MPR-2026-05-002'], part_id: partNutM12, qty: 200, required_date: new Date('2026-05-18'), notes: null, ...timestamp },

      // MPR-2026-05-003: Emergency Bearing
      { mpr_id: mprMap['MPR-2026-05-003'], part_id: partBearingAlt, qty: 100, required_date: new Date('2026-05-12'), notes: 'Urgent - line stop jika tidak ada', ...timestamp },

      // MPR-2026-06-001: Draft
      { mpr_id: mprMap['MPR-2026-06-001'], part_id: partSeatpost, qty: 75, required_date: new Date('2026-06-15'), notes: null, ...timestamp },
      { mpr_id: mprMap['MPR-2026-06-001'], part_id: partRim26, qty: 150, required_date: new Date('2026-06-15'), notes: null, ...timestamp },
    ].filter(d => d.part_id);

    await queryInterface.bulkInsert('s_material_purchase_request_details', mprDetailData, {});

    // ============================================================
    // 5. MPR LOGS
    // ============================================================
    const mprLogData = [
      { mpr_id: mprMap['MPR-2026-05-001'], action: 'created', ...timestamp },
      { mpr_id: mprMap['MPR-2026-05-001'], action: 'submitted', ...timestamp },
      { mpr_id: mprMap['MPR-2026-05-001'], action: 'approved', ...timestamp },

      { mpr_id: mprMap['MPR-2026-05-002'], action: 'created', ...timestamp },
      { mpr_id: mprMap['MPR-2026-05-002'], action: 'submitted', ...timestamp },
      { mpr_id: mprMap['MPR-2026-05-002'], action: 'approved', ...timestamp },

      { mpr_id: mprMap['MPR-2026-05-003'], action: 'created', ...timestamp },
      { mpr_id: mprMap['MPR-2026-05-003'], action: 'submitted', ...timestamp },

      { mpr_id: mprMap['MPR-2026-06-001'], action: 'created', ...timestamp },
    ];

    await queryInterface.bulkInsert('s_material_purchase_request_logs', mprLogData, {});

    // ============================================================
    // 6. MATERIAL PURCHASE ORDERS (MPO)
    // Skenario: 3 PO dari PR yang approved
    // - 1 PO approved (siap kirim)
    // - 1 PO submitted (menunggu approval)
    // - 1 PO draft
    // ============================================================
    const mpoData = [
      {
        mpr_id: mprMap['MPR-2026-05-001'],
        supplier_id: supplierId1,
        warehouse_id: warehouseId,
        number: 'MPO-2026-05-001',
        description: 'PO Frame & Komponen ke ACCELERATED SYSTEMS',
        po_date: new Date('2026-05-05'),
        payment_term: 'NET30',
        status: 'approved',
        remarks: 'Harga sesuai kontrak tahunan',
        created_by: staffId,
        approved_by: supervisorId,
        ...timestamp
      },
      {
        mpr_id: mprMap['MPR-2026-05-001'],
        supplier_id: supplierId2,
        warehouse_id: warehouseId,
        number: 'MPO-2026-05-002',
        description: 'PO Baterai & Controller ke AKEBONO',
        po_date: new Date('2026-05-05'),
        payment_term: 'NET45',
        status: 'submitted',
        remarks: null,
        created_by: staffId,
        approved_by: null,
        ...timestamp
      },
      {
        mpr_id: mprMap['MPR-2026-05-002'],
        supplier_id: supplierId4,
        warehouse_id: warehouseId,
        number: 'MPO-2026-05-003',
        description: 'PO Komponen Roda & Bearing',
        po_date: new Date('2026-05-07'),
        payment_term: 'NET30',
        status: 'draft',
        remarks: null,
        created_by: staffId,
        approved_by: null,
        ...timestamp
      },
    ];

    await queryInterface.bulkInsert('s_material_purchase_orders', mpoData, {});

    const mpos = await queryInterface.sequelize.query(
      `SELECT id, number FROM s_material_purchase_orders WHERE number IN ('MPO-2026-05-001','MPO-2026-05-002','MPO-2026-05-003') ORDER BY id ASC`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const mpoMap = Object.fromEntries(mpos.map(m => [m.number, m.id]));

    if (queryInterface.sequelize.options.dialect === 'postgres') {
      await queryInterface.sequelize.query(`SELECT setval('s_material_purchase_orders_id_seq', (SELECT MAX(id) FROM s_material_purchase_orders));`);
    }

    // ============================================================
    // 7. MPO DETAILS
    // ============================================================
    const mpoDetailData = [
      // MPO-2026-05-001: Komponen mekanik
      { mpo_id: mpoMap['MPO-2026-05-001'], part_id: partSeatpost, qty: 50, price: 160000, notes: null, ...timestamp },
      { mpo_id: mpoMap['MPO-2026-05-001'], part_id: partBattCase, qty: 50, price: 300000, notes: null, ...timestamp },

      // MPO-2026-05-002: Baterai Cell & Elektronik
      { mpo_id: mpoMap['MPO-2026-05-002'], part_id: partBms48v, qty: 50, price: 450000, notes: 'Harga belum termasuk PPN', ...timestamp },
      { mpo_id: mpoMap['MPO-2026-05-002'], part_id: partCell18650, qty: 3000, price: 55000, notes: null, ...timestamp },

      // MPO-2026-05-003: Roda & bearing
      { mpo_id: mpoMap['MPO-2026-05-003'], part_id: partTire26, qty: 100, price: 185000, notes: null, ...timestamp },
      { mpo_id: mpoMap['MPO-2026-05-003'], part_id: partSpokeSs, qty: 1800, price: 3500, notes: null, ...timestamp },
      { mpo_id: mpoMap['MPO-2026-05-003'], part_id: partNutM12, qty: 200, price: 4000, notes: null, ...timestamp },
    ].filter(d => d.part_id);

    await queryInterface.bulkInsert('s_material_purchase_order_details', mpoDetailData, {});

    // ============================================================
    // 8. MPO LOGS
    // ============================================================
    const mpoLogData = [
      { mpo_id: mpoMap['MPO-2026-05-001'], action: 'created', ...timestamp },
      { mpo_id: mpoMap['MPO-2026-05-001'], action: 'submitted', ...timestamp },
      { mpo_id: mpoMap['MPO-2026-05-001'], action: 'approved', ...timestamp },

      { mpo_id: mpoMap['MPO-2026-05-002'], action: 'created', ...timestamp },
      { mpo_id: mpoMap['MPO-2026-05-002'], action: 'submitted', ...timestamp },

      { mpo_id: mpoMap['MPO-2026-05-003'], action: 'created', ...timestamp },
    ];

    await queryInterface.bulkInsert('s_material_purchase_order_logs', mpoLogData, {});

    // ============================================================
    // 9. MATERIAL DELIVERY ORDERS (MDO)
    // Hanya dari MPO yang sudah approved (MPO-2026-05-001)
    // Skenario: 2 DO - 1 scheduled, 1 in transit
    // ============================================================
    const mdoData = [
      {
        mpo_id: mpoMap['MPO-2026-05-001'],
        dock_id: dockId1,
        number: 'MDO-2026-05-001',
        description: 'Pengiriman Frame & Rem dari ACCELERATED SYSTEMS',
        target_date: new Date('2026-05-14'),
        transporter: 'PT Kilat Ekspres',
        status: 'scheduled',
        remarks: 'Estimasi tiba pagi hari',
        created_by: staffId,
        approved_by: supervisorId,
        ...timestamp
      },
      {
        mpo_id: mpoMap['MPO-2026-05-001'],
        dock_id: dockId3,
        number: 'MDO-2026-05-002',
        description: 'Pengiriman Batch 2 - Sisa Frame',
        target_date: new Date('2026-05-20'),
        transporter: 'PT Cepat Sampai Logistik',
        status: 'draft',
        remarks: null,
        created_by: staffId,
        approved_by: null,
        ...timestamp
      },
    ];

    await queryInterface.bulkInsert('s_material_delivery_orders', mdoData, {});

    const mdos = await queryInterface.sequelize.query(
      `SELECT id, number FROM s_material_delivery_orders WHERE number IN ('MDO-2026-05-001','MDO-2026-05-002') ORDER BY id ASC`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const mdoMap = Object.fromEntries(mdos.map(m => [m.number, m.id]));

    if (queryInterface.sequelize.options.dialect === 'postgres') {
      await queryInterface.sequelize.query(`SELECT setval('s_material_delivery_orders_id_seq', (SELECT MAX(id) FROM s_material_delivery_orders));`);
    }

    // ============================================================
    // 10. MDO DETAILS
    // ============================================================
    const mdoDetailData = [
      // MDO-2026-05-001
      { mdo_id: mdoMap['MDO-2026-05-001'], part_id: partSeatpost, qty: 50, notes: null, ...timestamp },
      { mdo_id: mdoMap['MDO-2026-05-001'], part_id: partBattCase, qty: 25, notes: null, ...timestamp },

      // MDO-2026-05-002
      { mdo_id: mdoMap['MDO-2026-05-002'], part_id: partBattCase, qty: 25, notes: 'Sisa batch pertama', ...timestamp },
    ].filter(d => d.part_id);

    await queryInterface.bulkInsert('s_material_delivery_order_details', mdoDetailData, {});
  },

  // ============================================================
  // DOWN: hapus semua data seeder ini (urutan child → parent)
  // ============================================================
  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_material_delivery_order_details', null, {});
    await queryInterface.bulkDelete('s_material_delivery_orders', null, {});
    await queryInterface.bulkDelete('s_material_purchase_order_logs', null, {});
    await queryInterface.bulkDelete('s_material_purchase_order_details', null, {});
    await queryInterface.bulkDelete('s_material_purchase_orders', null, {});
    await queryInterface.bulkDelete('s_material_purchase_request_logs', null, {});
    await queryInterface.bulkDelete('s_material_purchase_request_details', null, {});
    await queryInterface.bulkDelete('s_material_purchase_requests', null, {});
    await queryInterface.bulkDelete('s_mrp_details', null, {});
    await queryInterface.bulkDelete('s_mrps', null, {});
  },
};