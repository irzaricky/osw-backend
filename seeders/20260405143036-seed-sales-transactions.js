/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    //Forecast Data
    const forecasts = [
      {
        id: 1,
        forecast_number: 'FC-YR-2026-001',
        forecast_type: 'Yearly',
        customer_id: 1,
        start_period: '2026-01-01',
        end_period: '2026-12-31',
        description: 'Yearly Forecast 2026',
        version: 'V1',
        status: 'Approved',
        created_by: 1,
        approved_by: 1,
        approved_at: new Date(),
        ...timestamp
      },
      {
        id: 2,
        forecast_number: 'FC-HY-2026-S1-001',
        forecast_type: 'Half-Year',
        customer_id: 2,
        start_period: '2026-01-01',
        end_period: '2026-06-30',
        description: 'Semester 1 Forecast',
        version: 'V1',
        status: 'Approved',
        created_by: 1,
        approved_by: 1,
        approved_at: new Date(),
        ...timestamp
      },
      {
        id: 3,
        forecast_number: 'FC-R4-2026-05-001',
        forecast_type: '4-Month',
        customer_id: 1,
        start_period: '2026-05-01',
        end_period: '2026-08-31',
        description: 'Rolling 4 Months (May - Aug) - 1 Month Fix, 3 Months Temporary',
        version: 'V1',
        status: 'Approved',
        created_by: 1,
        approved_by: 1,
        approved_at: new Date(),
        ...timestamp
      }
    ];
    await queryInterface.bulkInsert('s_sales_forecasts', forecasts, { ignoreDuplicates: true });

    let detailIdCounter = 1;
    const forecastDetails = [];

    // Details for Forecast 1 (Yearly)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    for (let part_id = 1; part_id <= 12; part_id++) {
      for (const month of months) {
        forecastDetails.push({
          id: detailIdCounter++,
          forecast_id: 1,
          forecast_detail_number: `FC-Y-26-P${part_id}-${month}`,
          part_id: part_id,
          qty_status: 'Temporary',
          forecast_qty: Math.floor(Math.random() * 101),
          ...timestamp
        });
      }
    }


    // Details for Forecast 2 (Half-Year)
    const forecast_2 = [
      { name: 'Jan', date: '2026-01-01' },
      { name: 'Feb', date: '2026-02-01' },
      { name: 'Mar', date: '2026-03-01' },
      { name: 'Apr', date: '2026-04-01' },
      { name: 'Mei', date: '2026-05-01' },
      { name: 'Jun', date: '2026-06-01' }
    ];
    for (let part_id = 1; part_id <= 12; part_id++) {
      for (const m of forecast_2) {
        forecastDetails.push({
          id: detailIdCounter++,
          forecast_id: 2,
          forecast_detail_number: `FC-HY-26S1-P${part_id}-${m.name}`,
          part_id: part_id,
          period_date: m.date,
          qty_status: 'Temporary',
          forecast_qty: Math.floor(Math.random() * 101),
          ...timestamp
        });
      }
    }


    // Details for Forecast 3
    const forecast_3 = [
      { name: 'Mei', date: '2026-05-01', status: 'Fix' },
      { name: 'Jun', date: '2026-06-01', status: 'Temporary' },
      { name: 'Jul', date: '2026-07-01', status: 'Temporary' },
      { name: 'Agu', date: '2026-08-01', status: 'Temporary' }
    ];
    for (let part_id = 1; part_id <= 12; part_id++) {
      for (const m of forecast_3) {
        forecastDetails.push({
          id: detailIdCounter++,
          forecast_id: 3,
          forecast_detail_number: `FCM-2605-P${part_id}-${m.name}`,
          part_id: part_id,
          period_date: m.date,
          qty_status: m.status,
          forecast_qty: Math.floor(Math.random() * 101),
          ...timestamp
        });
      }
    }

    await queryInterface.bulkInsert('s_sales_forecast_details', forecastDetails, { ignoreDuplicates: true });

    // SPR Data (Generated from Forecast 3)
    const sprs = [
      {
        id: 1,
        spr_number: 'SPR-2026-05-101',
        spr_name: 'Request for May Fix Forecast Demand',
        source: 'Automatic',
        forecast_id: 3,
        request_date: new Date(),
        required_date: new Date(new Date().setDate(new Date().getDate() + 14)),
        confirmed_date: new Date(),
        description: 'Generated automatically from FC-R4-2026-05-001 for Fix Period',
        status: 'Approved',
        remarks: 'Stock verified, proceed.',
        created_by: 1,
        approved_by: 1,
        ...timestamp
      }
    ];
    await queryInterface.bulkInsert('s_sales_purchase_requests', sprs, { ignoreDuplicates: true });

    const sprDetails = forecastDetails
      .filter(fd => fd.forecast_id === 3 && fd.qty_status === 'Fix')
      .map((fd, index) => ({
        id: index + 1,
        spr_id: 1,
        part_id: fd.part_id,
        qty: fd.forecast_qty,
        ...timestamp
      }));
    await queryInterface.bulkInsert('s_sales_purchase_request_details', sprDetails, { ignoreDuplicates: true });

    // SPO Data (Generated from SPR)
    const spos = [
      {
        id: 1,
        spo_number: 'SPO-2026-06-200',
        customer_id: 1,
        spr_id: 1,
        shipping_address: 'Jalan jalan alun alun utara solo',
        spo_date: new Date(),
        delivery_due_date: new Date(new Date().setDate(new Date().getDate() + 20)),
        status: 'Processing',
        created_by: 1,
        ...timestamp
      }
    ];
    await queryInterface.bulkInsert('s_sales_purchase_orders', spos, { ignoreDuplicates: true });

    const spoDetails = sprDetails.map((spr, index) => {
      const isClosed = index % 2 === 0;
      return {
        id: index + 1,
        spo_id: 1,
        part_id: spr.part_id,
        ordered_qty: spr.qty,
        sent_qty: isClosed ? spr.qty : Math.floor(spr.qty / 2),
        last_shipment_date: new Date(),
        status: isClosed ? 'Closed' : 'Partial',
        ...timestamp
      };
    });
    await queryInterface.bulkInsert('s_sales_purchase_order_details', spoDetails, { ignoreDuplicates: true });

    // Delivery Plans & Orders Data ---
    let dpIdCounter = 1;
    let dpDetailIdCounter = 1;
    let doIdCounter = 1;

    const deliveryPlans = [];
    const deliveryPlanDetails = [];
    const deliveryOrders = [];

    // Skenario 1: Completed Delivery (Parts 1-4)
    deliveryPlans.push({
      id: dpIdCounter,
      dp_number: `DP-2026-06-00${dpIdCounter}`,
      scheduled_date: new Date(new Date().setDate(new Date().getDate() + 2)),
      time_start: '08:00:00',
      time_end: '12:00:00',
      warehouse_id: 1,
      dock_id: 1,
      destination: 'Gudang Pusat Customer A',
      status: 'Shipped',
      created_by: 1,
      ...timestamp
    });

    const scenario1Details = spoDetails.slice(0, 4);
    scenario1Details.forEach(spo => {
      deliveryPlanDetails.push({
        id: dpDetailIdCounter++,
        delivery_plan_id: dpIdCounter,
        spo_detail_id: spo.id,
        planned_qty: spo.sent_qty,
        ...timestamp
      });
    });

    deliveryOrders.push({
      id: doIdCounter,
      do_number: `DO-2026-06-10${doIdCounter}`,
      delivery_plan_id: dpIdCounter,
      customer_id: 1,
      vehicle_id: 1,
      driver_id: 1,
      shipment_date: new Date(new Date().setDate(new Date().getDate() + 2)),
      delivery_status: 'Delivered',
      proof_of_delivery: '/uploads/dummy-1.jpg',
      notes: 'Diterima dengan baik oleh Bapak Budi',
      created_by: 1,
      ...timestamp
    });

    dpIdCounter++;
    doIdCounter++;

    // Skenario 2: In Transit (Parts 5-8)
    deliveryPlans.push({
      id: dpIdCounter,
      dp_number: `DP-2026-06-00${dpIdCounter}`,
      scheduled_date: new Date(new Date().setDate(new Date().getDate() + 2)),
      time_start: '13:00:00',
      time_end: '17:00:00',
      warehouse_id: 1,
      dock_id: 1,
      destination: 'Gudang Cabang Customer A',
      status: 'Shipped',
      created_by: 1,
      ...timestamp
    });

    const scenario2Details = spoDetails.slice(4, 8);
    scenario2Details.forEach(spo => {
      deliveryPlanDetails.push({
        id: dpDetailIdCounter++,
        delivery_plan_id: dpIdCounter,
        spo_detail_id: spo.id,
        planned_qty: spo.sent_qty,
        ...timestamp
      });
    });

    deliveryOrders.push({
      id: doIdCounter,
      do_number: `DO-2026-06-10${doIdCounter}`,
      delivery_plan_id: dpIdCounter,
      customer_id: 1,
      vehicle_id: 1,
      driver_id: 1,
      shipment_date: new Date(new Date().setDate(new Date().getDate() + 2)),
      delivery_status: 'In Transit',
      proof_of_delivery: null,
      notes: null,
      created_by: 1,
      ...timestamp
    });

    dpIdCounter++;
    doIdCounter++;

    // Skenario 3: Scheduled (Parts 9-12)
    deliveryPlans.push({
      id: dpIdCounter,
      dp_number: `DP-2026-06-00${dpIdCounter}`,
      scheduled_date: new Date(new Date().setDate(new Date().getDate() + 3)),
      time_start: '08:00:00',
      time_end: '12:00:00',
      warehouse_id: 1,
      dock_id: 1,
      destination: 'Gudang Pusat Customer A',
      status: 'Scheduled',
      created_by: 1,
      ...timestamp
    });

    const scenario3Details = spoDetails.slice(8, 12);
    scenario3Details.forEach(spo => {
      deliveryPlanDetails.push({
        id: dpDetailIdCounter++,
        delivery_plan_id: dpIdCounter,
        spo_detail_id: spo.id,
        planned_qty: spo.sent_qty,
        ...timestamp
      });
    });
    await queryInterface.bulkInsert('s_delivery_plans', deliveryPlans, { ignoreDuplicates: true });
    await queryInterface.bulkInsert('s_delivery_plan_details', deliveryPlanDetails, { ignoreDuplicates: true });
    await queryInterface.bulkInsert('s_delivery_orders', deliveryOrders, { ignoreDuplicates: true });

  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_delivery_orders', null, {});
    await queryInterface.bulkDelete('s_delivery_plan_details', null, {});
    await queryInterface.bulkDelete('s_delivery_plans', null, {});

    await queryInterface.bulkDelete('s_sales_purchase_order_details', null, {});
    await queryInterface.bulkDelete('s_sales_purchase_orders', null, {});
    await queryInterface.bulkDelete('s_sales_purchase_request_details', null, {});
    await queryInterface.bulkDelete('s_sales_purchase_requests', null, {});
    await queryInterface.bulkDelete('s_sales_forecast_logs', null, {});
    await queryInterface.bulkDelete('s_sales_forecast_details', null, {});
    await queryInterface.bulkDelete('s_sales_forecasts', null, {});
  }
};
