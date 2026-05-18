export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date('2026-05-17T07:00:00Z'), updated_at: new Date('2026-05-17T07:00:00Z') };

    // =========================
    // SALES PURCHASE ORDERS
    // =========================
    const spoData = [];

    for (let i = 1; i <= 10; i++) {
      spoData.push({
        spo_number: `SPO-2026-${String(i).padStart(4, '0')}`,
        customer_id: ((i - 1) % 6) + 1,
        spr_id: null,
        shipping_address: `Alamat Customer ${i}`,
        spo_date: new Date('2026-05-17T08:00:00Z'),
        delivery_due_date: new Date(new Date('2026-05-17T08:00:00Z').getTime() + i * 86400000),
        status: 'Approved',
        created_by: 1,
        ...timestamp
      });
    }

    const insertedSPOs = await queryInterface.bulkInsert(
      's_sales_purchase_orders',
      spoData,
      {
        returning: true,
      }
    );

    // =========================
    // SPO DETAILS
    // =========================
    const spoDetailData = [];

    for (let i = 1; i <= 10; i++) {
      spoDetailData.push({
        spo_id: insertedSPOs[i - 1].id,
        part_id: i,
        ordered_qty: 100 + i * 10,
        sent_qty: 20 + i * 5,
        last_shipment_date: new Date('2026-05-17T11:00:00Z'),
        status: 'Open',
        ...timestamp
      });
    }

    await queryInterface.bulkInsert(
      's_sales_purchase_order_details',
      spoDetailData,
      {}
    );

    // =========================
    // DELIVERY PLANS
    // =========================
    const deliveryPlanData = [];
    const dockTimeSlots = {};

    for (let i = 1; i <= 10; i++) {
      const dayOffset = i % 3;
      const dockId = ((i - 1) % 3) + 1;
      const scheduledTime = new Date('2026-05-17').getTime() + dayOffset * 86400000;

      if (dockTimeSlots[`${dockId}-${dayOffset}`] === undefined) {
        dockTimeSlots[`${dockId}-${dayOffset}`] = 8; // start from 08:00
      }
      const startHour = dockTimeSlots[`${dockId}-${dayOffset}`];
      const endHour = startHour + 2; // each plan is 2 hours slot
      dockTimeSlots[`${dockId}-${dayOffset}`] = endHour;

      const timeStartStr = `${String(startHour).padStart(2, '0')}:00:00`;
      const timeEndStr = `${String(endHour).padStart(2, '0')}:00:00`;

      deliveryPlanData.push({
        dp_number: `DP-2026-${String(i).padStart(4, '0')}`,
        scheduled_date: new Date(scheduledTime),
        time_start: timeStartStr,
        time_end: timeEndStr,
        warehouse_id: ((i - 1) % 3) + 1,
        dock_id: dockId,
        destination: `Destination Address ${i}`,
        status: 'Scheduled',
        created_by: 1,
        ...timestamp
      });
    }

    await queryInterface.bulkInsert(
      's_delivery_plans',
      deliveryPlanData,
      {}
    );

    // =========================
    // DELIVERY PLAN DETAILS
    // =========================
    const deliveryPlanDetailData = [];

    for (let i = 1; i <= 10; i++) {
      deliveryPlanDetailData.push({
        delivery_plan_id: i,
        spo_detail_id: i,
        planned_qty: 50 + i * 5,
        ...timestamp
      });
    }

    await queryInterface.bulkInsert(
      's_delivery_plan_details',
      deliveryPlanDetailData,
      {}
    );

    // =========================
    // DELIVERY ORDERS
    // =========================
    const deliveryOrderData = [];

    for (let i = 1; i <= 10; i++) {
      const shipmentTime = new Date('2026-05-17').getTime() + (i % 3) * 86400000;
      const deliveryStatus = i <= 7 ? 'Delivered' : 'In Transit';
      const receivedAt = deliveryStatus === 'Delivered' ? new Date(shipmentTime + 4 * 3600000) : null;

      deliveryOrderData.push({
        do_number: `DO-2026-${String(i).padStart(4, '0')}`,
        delivery_plan_id: i,
        customer_id: ((i - 1) % 6) + 1,
        vehicle_id: ((i - 1) % 5) + 1,
        driver_id: ((i - 1) % 5) + 1,
        shipment_date: new Date(shipmentTime),
        delivery_status: deliveryStatus,
        proof_of_delivery: deliveryStatus === 'Delivered' ? `/uploads/pod-dummy-${i}.jpg` : null,
        notes: `Pengiriman batch ${i}`,
        created_by: 1,
        received_at: receivedAt,
        ...timestamp
      });
    }

    await queryInterface.bulkInsert(
      's_delivery_orders',
      deliveryOrderData,
      {}
    );

    // =========================
    // DELIVERY ORDER DETAILS
    // =========================
    const deliveryOrderDetailData = [];

    for (let i = 1; i <= 10; i++) {
      deliveryOrderDetailData.push({
        delivery_order_id: i,
        delivery_plan_detail_id: i,
        sent_qty: 40 + i * 5,
        received_qty: i <= 7 ? 40 + i * 5 : null,
        notes: `Detail shipment ${i}`,
        ...timestamp
      });
    }

    await queryInterface.bulkInsert(
      's_delivery_order_details',
      deliveryOrderDetailData,
      {}
    );
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