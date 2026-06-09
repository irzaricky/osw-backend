export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date('2026-05-17T07:00:00Z'), updated_at: new Date('2026-05-17T07:00:00Z') };

    // Synchronize auto-increment sequences
    try {
      await queryInterface.sequelize.query(`
        SELECT setval('s_sales_purchase_orders_id_seq', COALESCE((SELECT MAX(id) FROM s_sales_purchase_orders), 1), true);
        SELECT setval('s_sales_purchase_order_details_id_seq', COALESCE((SELECT MAX(id) FROM s_sales_purchase_order_details), 1), true);
        SELECT setval('s_delivery_plans_id_seq', COALESCE((SELECT MAX(id) FROM s_delivery_plans), 1), true);
        SELECT setval('s_delivery_plan_details_id_seq', COALESCE((SELECT MAX(id) FROM s_delivery_plan_details), 1), true);
        SELECT setval('s_delivery_orders_id_seq', COALESCE((SELECT MAX(id) FROM s_delivery_orders), 1), true);
        SELECT setval('s_delivery_order_details_id_seq', COALESCE((SELECT MAX(id) FROM s_delivery_order_details), 1), true);
      `);
    } catch (e) {
      // Ignore if not postgresql or sequences do not exist yet
    }

    // ─── Date anchors ─────────────────────────────────────────────────────────
    const d = (isoStr) => new Date(isoStr);

    const batchDates = {
      A: ['2026-05-14','2026-05-15','2026-05-16','2026-05-17'],
      B: ['2026-05-28','2026-05-29','2026-05-30','2026-05-31'],
      C: ['2026-06-15','2026-06-16','2026-06-17','2026-06-18'], // Juni
      D: ['2026-06-27','2026-06-28','2026-06-29','2026-06-30'], // Juni
      E: ['2026-07-13','2026-07-14','2026-07-15','2026-07-16'], // Juli
      F: ['2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31'], // Juli
    };

    const spreadDates = (anchors, count) => {
      const out = [];
      for (let i = 0; i < count; i++) out.push(anchors[i % anchors.length]);
      return out;
    };

    const batches = [
      { key: 'A', anchors: batchDates.A, count: 10 },
      { key: 'B', anchors: batchDates.B, count: 10 },
      { key: 'C', anchors: batchDates.C, count: 10 },
      { key: 'D', anchors: batchDates.D, count: 10 },
      { key: 'E', anchors: batchDates.E, count: 10 },
      { key: 'F', anchors: batchDates.F, count: 10 },
    ];

    const allEntries = []; 
    let globalIdx = 1;
    for (const batch of batches) {
      const dates = spreadDates(batch.anchors, batch.count);
      for (let i = 0; i < batch.count; i++) {
        allEntries.push({ shipmentDate: dates[i], batchKey: batch.key, localIdx: i + 1, globalIdx: globalIdx++ });
      }
    }

    // =========================================================================
    // MAPPING QUANTITY LOGIC (KHUSUS JUNI & JULI)
    // =========================================================================
    const qtyMap = allEntries.map((e) => {
      // Jika Bulan Juni (C, D) atau Juli (E, F)
      if (['C', 'D', 'E', 'F'].includes(e.batchKey)) {
        let baseOrdered = 50;
        
        if (['C', 'D'].includes(e.batchKey)) {
          // Juni (Peak Season): Kuantitas berkisar 80 s.d 150 unit
          baseOrdered = 80 + ((e.globalIdx * 7) % 71);
        } else {
          // Juli: Kuantitas berkisar 50 s.d 110 unit
          baseOrdered = 50 + ((e.globalIdx * 11) % 61);
        }

        // Distribusi turunan kuantitas harian yang logis
        const planned = Math.ceil(baseOrdered * 0.8);        // 80% masuk rencana pengiriman harian
        const sent = planned;                                // 100% rencana berhasil dimuat ke truk
        const historicalSent = Math.floor(baseOrdered * 0.2); // Sisa histori pengiriman PO sebelumnya

        return {
          ordered: baseOrdered,
          historicalSent: historicalSent,
          planned: planned,
          sent: sent
        };
      } 
      
      // JIKA BULAN MEI: Tetap menggunakan rumus perhitungan asli bawaan Anda
      return {
        ordered: 100 + e.globalIdx * 10,
        historicalSent: 20 + e.globalIdx * 5,
        planned: 50 + e.globalIdx * 5,
        sent: 40 + e.globalIdx * 5
      };
    });

    // =========================
    // SALES PURCHASE ORDERS
    // =========================
    const spoData = allEntries.map((e) => ({
      spo_number: `SPO-2026-${String(e.globalIdx).padStart(4, '0')}`,
      customer_id: ((e.globalIdx - 1) % 6) + 1,
      spr_id: null,
      shipping_address: `Alamat Customer ${e.globalIdx}`,
      spo_date: d(`${e.shipmentDate}T08:00:00Z`),
      delivery_due_date: d(`${e.shipmentDate}T08:00:00Z`),
    
      status: 'Completed',
    
      remarks: `Sales Purchase Order ${e.globalIdx}`,
      po_document: `/uploads/po/spo-${e.globalIdx}.pdf`,
    
      created_by: 1,
    
      ...timestamp,
    }));

    const insertedSPOs = await queryInterface.bulkInsert('s_sales_purchase_orders', spoData, { returning: true });

    // =========================
    // SPO DETAILS
    // =========================
    const spoDetailData = allEntries.map((e, idx) => ({
      spo_id: insertedSPOs[idx].id,
      part_id: ((e.globalIdx - 1) % 10) + 1,
      ordered_qty: qtyMap[idx].ordered,          // MODIFIKASI: Kondisional per bulan
      sent_qty: qtyMap[idx].historicalSent,      // MODIFIKASI: Kondisional per bulan
      last_shipment_date: d(`${e.shipmentDate}T11:00:00Z`),
      status: 'Open',
      ...timestamp,
    }));

    const insertedSPODetails = await queryInterface.bulkInsert('s_sales_purchase_order_details', spoDetailData, { returning: true });

    // =========================
    // DELIVERY PLANS
    // =========================
    const dockTimeSlots = {};

    const deliveryPlanData = allEntries.map((e, idx) => {
      const dockId   = ((e.globalIdx - 1) % 3) + 1;
      const slotKey  = `${dockId}-${e.shipmentDate}`;
      if (dockTimeSlots[slotKey] === undefined) dockTimeSlots[slotKey] = 8;
      const startHour = dockTimeSlots[slotKey];
      const endHour   = startHour + 2;
      dockTimeSlots[slotKey] = endHour >= 18 ? 8 : endHour;

      return {
        dp_number:      `DP-2026-${String(e.globalIdx).padStart(4, '0')}`,
        scheduled_date: d(`${e.shipmentDate}T00:00:00Z`),
        time_start:     `${String(startHour).padStart(2, '0')}:00:00`,
        time_end:       `${String(endHour).padStart(2, '0')}:00:00`,
        warehouse_id:   ((e.globalIdx - 1) % 3) + 1,
        dock_id:        dockId,
        destination:    `Destination Address ${e.globalIdx}`,
        status:         'Scheduled',
        created_by:     1,
        ...timestamp,
      };
    });

    const insertedPlans = await queryInterface.bulkInsert('s_delivery_plans', deliveryPlanData, { returning: true });

    // =========================
    // DELIVERY PLAN DETAILS
    // =========================
    const deliveryPlanDetailData = allEntries.map((e, idx) => ({
      delivery_plan_id: insertedPlans[idx].id,
      spo_detail_id:    insertedSPODetails[idx].id,
      planned_qty:      qtyMap[idx].planned,     // MODIFIKASI: Kondisional per bulan
      ...timestamp,
    }));

    const insertedPlanDetails = await queryInterface.bulkInsert('s_delivery_plan_details', deliveryPlanDetailData, { returning: true });

    // =========================
    // DELIVERY ORDERS
    // =========================
    const resolveStatus = (batchKey, localIdx) => {
      return localIdx <= 7 ? 'Scheduled' : 'In Transit';
    };

    const deliveryOrderData = allEntries.map((e, idx) => {
      const status = resolveStatus(e.batchKey, e.localIdx);
    
      const shipTime = d(`${e.shipmentDate}T07:00:00Z`);
    
      const receivedAt =
        status === 'Delivered'
          ? new Date(shipTime.getTime() + 4 * 60 * 60 * 1000)
          : null;
    
      return {
        do_number: `DO-2026-${String(e.globalIdx).padStart(4, '0')}`,
    
        delivery_plan_id: insertedPlans[idx].id,
    
        customer_id: ((e.globalIdx - 1) % 6) + 1,
    
        vehicle_id: ((e.globalIdx - 1) % 5) + 1,
    
        driver_id: ((e.globalIdx - 1) % 5) + 1,
    
        shipment_date: shipTime,
    
        delivery_status: status,
    
        proof_of_delivery: null,
    
        notes: `Pengiriman batch ${e.batchKey}-${e.localIdx}`,
    
        received_at: receivedAt,
    
        loading_photo_url: `/uploads/loading/loading-${e.globalIdx}.jpg`,
    
        dispatch_approved_by: 1,
    
        dispatch_approved_at: new Date(
          shipTime.getTime() - 30 * 60 * 1000
        ),
    
        created_by: 1,
    
        ...timestamp,
      };
    });

    const insertedOrders = await queryInterface.bulkInsert('s_delivery_orders', deliveryOrderData, { returning: true });

    // =========================
    // DELIVERY ORDER DETAILS
    // =========================
    const deliveryOrderDetailData = allEntries.map((e, idx) => {
      const status = resolveStatus(e.batchKey, e.localIdx);
    
      const sentQty = qtyMap[idx].sent;
    
      return {
        delivery_order_id: insertedOrders[idx].id,
    
        delivery_plan_detail_id: insertedPlanDetails[idx].id,
    
        sent_qty: sentQty,
    
        received_qty: null,
    
        notes: `Detail shipment ${e.batchKey}-${e.localIdx}`,
    
        ...timestamp,
      };
    });

    await queryInterface.bulkInsert('s_delivery_order_details', deliveryOrderDetailData, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_delivery_order_details', null, {});
    await queryInterface.bulkDelete('s_delivery_orders', null, {});
    await queryInterface.bulkDelete('s_delivery_plan_details', null, {});
    await queryInterface.bulkDelete('s_delivery_plans', null, {});
    await queryInterface.bulkDelete('s_sales_purchase_order_details', null, {});
    await queryInterface.bulkDelete('s_sales_purchase_orders', null, {});
  },
};