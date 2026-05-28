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
    // Batch A : 14–17 Mei  (4 tanggal × 3 DO = 12 DO? → pakai 10, loop)
    // Batch B : 28–31 Mei
    // Batch C : 15–18 Juni
    // Batch D : 27–30 Juni
    // Batch E : 13–16 Juli
    // Batch F : 27–31 Juli
    const d = (isoStr) => new Date(isoStr);

    const batchDates = {
      A: ['2026-05-14','2026-05-15','2026-05-16','2026-05-17'],
      B: ['2026-05-28','2026-05-29','2026-05-30','2026-05-31'],
      C: ['2026-06-15','2026-06-16','2026-06-17','2026-06-18'],
      D: ['2026-06-27','2026-06-28','2026-06-29','2026-06-30'],
      E: ['2026-07-13','2026-07-14','2026-07-15','2026-07-16'],
      F: ['2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31'],
    };

    // ─── Helper: build N evenly-spread dates from an anchor array ─────────────
    const spreadDates = (anchors, count) => {
      const out = [];
      for (let i = 0; i < count; i++) out.push(anchors[i % anchors.length]);
      return out;
    };

    // Total 60 entries (10 per batch × 6 batch)
    const batches = [
      { key: 'A', anchors: batchDates.A, count: 10 },
      { key: 'B', anchors: batchDates.B, count: 10 },
      { key: 'C', anchors: batchDates.C, count: 10 },
      { key: 'D', anchors: batchDates.D, count: 10 },
      { key: 'E', anchors: batchDates.E, count: 10 },
      { key: 'F', anchors: batchDates.F, count: 10 },
    ];

    const allEntries = []; // { shipmentDate, batchKey, localIdx, globalIdx }
    let globalIdx = 1;
    for (const batch of batches) {
      const dates = spreadDates(batch.anchors, batch.count);
      for (let i = 0; i < batch.count; i++) {
        allEntries.push({ shipmentDate: dates[i], batchKey: batch.key, localIdx: i + 1, globalIdx: globalIdx++ });
      }
    }

    const TOTAL = allEntries.length; // 60

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
      status: 'Approved',
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
      ordered_qty: 100 + e.globalIdx * 10,
      sent_qty: 20 + e.globalIdx * 5,
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
      // Cap at 18:00 to avoid midnight overflow, then reset
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
      planned_qty:      50 + e.globalIdx * 5,
      ...timestamp,
    }));

    const insertedPlanDetails = await queryInterface.bulkInsert('s_delivery_plan_details', deliveryPlanDetailData, { returning: true });

    // =========================
    // DELIVERY ORDERS
    // Status logic per batch:
    //   7 pertama Scheduled, 3 terakhir In Transit
    // =========================
    const resolveStatus = (batchKey, localIdx) => {
      return localIdx <= 7 ? 'Scheduled' : 'In Transit';
    };

    const deliveryOrderData = allEntries.map((e, idx) => {
      const status     = resolveStatus(e.batchKey, e.localIdx);
      const shipTime   = d(`${e.shipmentDate}T07:00:00Z`);
      const receivedAt = status === 'Scheduled' ? new Date(shipTime.getTime() + 4 * 3600000) : null;

      return {
        do_number:        `DO-2026-${String(e.globalIdx).padStart(4, '0')}`,
        delivery_plan_id: insertedPlans[idx].id,
        customer_id:      ((e.globalIdx - 1) % 6) + 1,
        vehicle_id:       ((e.globalIdx - 1) % 5) + 1,
        driver_id:        ((e.globalIdx - 1) % 5) + 1,
        shipment_date:    shipTime,
        delivery_status:  status,
        proof_of_delivery: status === 'Scheduled' ? `/uploads/pod-dummy-${e.globalIdx}.jpg` : null,
        notes:            `Pengiriman batch ${e.batchKey}-${e.localIdx}`,
        created_by:       1,
        received_at:      receivedAt,
        ...timestamp,
      };
    });

    const insertedOrders = await queryInterface.bulkInsert('s_delivery_orders', deliveryOrderData, { returning: true });

    // =========================
    // DELIVERY ORDER DETAILS
    // =========================
    const deliveryOrderDetailData = allEntries.map((e, idx) => {
      const status    = resolveStatus(e.batchKey, e.localIdx);
      const sentQty   = 40 + e.globalIdx * 5;
      return {
        delivery_order_id:      insertedOrders[idx].id,
        delivery_plan_detail_id: insertedPlanDetails[idx].id,
        sent_qty:               sentQty,
        received_qty:           status === 'Scheduled' ? sentQty : null,
        notes:                  `Detail shipment ${e.batchKey}-${e.localIdx}`,
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