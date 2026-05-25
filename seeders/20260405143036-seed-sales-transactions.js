/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    // Seasonal Demand Curve Reference Models
    const baseQty = [80, 120, 150, 95, 110, 130, 85, 140, 160, 115, 105, 125];
    const seasonalFactors = [1.0, 0.9, 1.1, 1.2, 1.3, 1.25, 1.1, 0.95, 1.0, 1.15, 1.2, 1.4];

    // Forecast Data (Fixed Reference May 2026 context)
    const forecasts = [
      {
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
        approved_at: new Date('2026-04-28T09:00:00Z'),
        ...timestamp
      },
      {
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
        approved_at: new Date('2026-04-28T10:00:00Z'),
        ...timestamp
      },
      {
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
        approved_at: new Date('2026-04-28T11:00:00Z'),
        ...timestamp
      }
    ];
    await queryInterface.bulkInsert('s_sales_forecasts', forecasts, { ignoreDuplicates: true });

    const forecastDetails = [];

    // Details for Forecast 1 (Yearly)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    for (let part_id = 1; part_id <= 12; part_id++) {
      months.forEach((month, mIdx) => {
        const base = baseQty[(part_id - 1) % baseQty.length];
        const factor = seasonalFactors[mIdx];
        const monthNum = String(mIdx + 1).padStart(2, '0');
        forecastDetails.push({
          forecast_id: 1,
          forecast_detail_number: `FC-Y-26-P${part_id}-${month}`,
          part_id: part_id,
          period_date: `2026-${monthNum}-01`,
          qty_status: 'Temporary',
          forecast_qty: Math.round(base * factor),
          ...timestamp
        });
      });
    }

    // Details for Forecast 2 (Half-Year)
    const forecast_2 = [
      { name: 'Jan', date: '2026-01-01', idx: 0 },
      { name: 'Feb', date: '2026-02-01', idx: 1 },
      { name: 'Mar', date: '2026-03-01', idx: 2 },
      { name: 'Apr', date: '2026-04-01', idx: 3 },
      { name: 'Mei', date: '2026-05-01', idx: 4 },
      { name: 'Jun', date: '2026-06-01', idx: 5 }
    ];
    for (let part_id = 1; part_id <= 12; part_id++) {
      for (const m of forecast_2) {
        const base = baseQty[(part_id - 1) % baseQty.length];
        const factor = seasonalFactors[m.idx];
        forecastDetails.push({
          forecast_id: 2,
          forecast_detail_number: `FC-HY-26S1-P${part_id}-${m.name}`,
          part_id: part_id,
          period_date: m.date,
          qty_status: 'Temporary',
          forecast_qty: Math.round(base * factor),
          ...timestamp
        });
      }
    }

    // Details for Forecast 3 (4-Month Rolling)
    const forecast_3 = [
      { name: 'Mei', date: '2026-05-01', status: 'Fix', idx: 4 },
      { name: 'Jun', date: '2026-06-01', status: 'Temporary', idx: 5 },
      { name: 'Jul', date: '2026-07-01', status: 'Temporary', idx: 6 },
      { name: 'Agu', date: '2026-08-01', status: 'Temporary', idx: 7 }
    ];
    for (let part_id = 1; part_id <= 12; part_id++) {
      for (const m of forecast_3) {
        const base = baseQty[(part_id - 1) % baseQty.length];
        const factor = seasonalFactors[m.idx];
        forecastDetails.push({
          forecast_id: 3,
          forecast_detail_number: `FCM-2605-P${part_id}-${m.name}`,
          part_id: part_id,
          period_date: m.date,
          qty_status: m.status,
          forecast_qty: Math.round(base * factor),
          ...timestamp
        });
      }
    }

    await queryInterface.bulkInsert('s_sales_forecast_details', forecastDetails, { ignoreDuplicates: true });

    // SPR Data (Generated from Forecast 3 - Fixed May 2026 Timeline)
    const sprs = [
      {
        spr_number: 'SPR-2026-05-101',
        spr_name: 'Request for May Fix Forecast Demand',
        source: 'Automatic',
        forecast_id: 3,
        request_date: new Date('2026-05-01T08:00:00Z'),
        required_date: new Date('2026-05-15T08:00:00Z'),
        confirmed_date: new Date('2026-05-02T10:00:00Z'),
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
        spr_id: 1,
        part_id: fd.part_id,
        qty: fd.forecast_qty,
        ...timestamp
      }));
    await queryInterface.bulkInsert('s_sales_purchase_request_details', sprDetails, { ignoreDuplicates: true });

    // SPO Data (Generated from SPR - Fixed May 2026 Timeline)
    const spos = [
      {
        spo_number: 'SPO-2026-06-200',
        customer_id: 1,
        spr_id: 1,
        shipping_address: 'Jalan jalan alun alun utara solo',
        spo_date: new Date('2026-05-03T09:00:00Z'),
        delivery_due_date: new Date('2026-05-23T09:00:00Z'),
        status: 'Processing',
        created_by: 1,
        ...timestamp
      }
    ];
    await queryInterface.bulkInsert('s_sales_purchase_orders', spos, { ignoreDuplicates: true });

    const spoDetails = sprDetails.map((spr, index) => {
      const isClosed = index % 2 === 0;
      return {
        spo_id: 1,
        part_id: spr.part_id,
        ordered_qty: spr.qty,
        sent_qty: isClosed ? spr.qty : Math.floor(spr.qty / 2),
        last_shipment_date: new Date('2026-05-17T11:00:00Z'),
        status: isClosed ? 'Closed' : 'Partial',
        ...timestamp
      };
    });
    await queryInterface.bulkInsert('s_sales_purchase_order_details', spoDetails, { ignoreDuplicates: true });

    // Delivery Plans & Orders Data ---
    let dpIdCounter = 1;
    let doIdCounter = 1;

    const deliveryPlans = [];
    const deliveryPlanDetails = [];
    const deliveryOrders = [];

    // Scenario 1: Completed Delivery (Parts 1-4)
    deliveryPlans.push({
      dp_number: `DP-2026-06-00${dpIdCounter}`,
      scheduled_date: new Date('2026-05-17'),
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
    scenario1Details.forEach((spo, index) => {
      deliveryPlanDetails.push({
        delivery_plan_id: dpIdCounter,
        spo_detail_id: index + 1,
        planned_qty: spo.sent_qty,
        ...timestamp
      });
    });

    deliveryOrders.push({
      do_number: `DO-2026-06-10${doIdCounter}`,
      delivery_plan_id: dpIdCounter,
      customer_id: 1,
      vehicle_id: 1,
      driver_id: 1,
      shipment_date: new Date('2026-05-17'),
      delivery_status: 'Delivered',
      proof_of_delivery: '/uploads/dummy-1.jpg',
      notes: 'Diterima dengan baik oleh Bapak Budi',
      created_by: 1,
      received_at: new Date('2026-05-17T15:30:00Z'),
      ...timestamp
    });

    dpIdCounter++;
    doIdCounter++;

    // Scenario 2: In Transit (Parts 5-8)
    deliveryPlans.push({
      dp_number: `DP-2026-06-00${dpIdCounter}`,
      scheduled_date: new Date('2026-05-18'),
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
    scenario2Details.forEach((spo, index) => {
      deliveryPlanDetails.push({
        delivery_plan_id: dpIdCounter,
        spo_detail_id: index + 5,
        planned_qty: spo.sent_qty,
        ...timestamp
      });
    });

    deliveryOrders.push({
      do_number: `DO-2026-06-10${doIdCounter}`,
      delivery_plan_id: dpIdCounter,
      customer_id: 1,
      vehicle_id: 1,
      driver_id: 1,
      shipment_date: new Date('2026-05-18'),
      delivery_status: 'In Transit',
      proof_of_delivery: null,
      notes: null,
      created_by: 1,
      received_at: null,
      ...timestamp
    });

    dpIdCounter++;
    doIdCounter++;

    // Scenario 3: Scheduled (Parts 9-12)
    deliveryPlans.push({
      dp_number: `DP-2026-06-00${dpIdCounter}`,
      scheduled_date: new Date('2026-05-19'),
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
    scenario3Details.forEach((spo, index) => {
      deliveryPlanDetails.push({
        delivery_plan_id: dpIdCounter,
        spo_detail_id: index + 9,
        planned_qty: spo.sent_qty,
        ...timestamp
      });
    });

    const insertedPlans = await queryInterface.bulkInsert('s_delivery_plans', deliveryPlans, { ignoreDuplicates: true, returning: true });
    
    // Map temporary plan IDs to actual database IDs
    const planIdMap = {};
    deliveryPlans.forEach((dp, idx) => {
      const inserted = insertedPlans.find(ip => ip.dp_number === dp.dp_number);
      if (inserted) {
        planIdMap[idx + 1] = inserted.id;
      }
    });

    const finalPlanDetails = deliveryPlanDetails.map(dpd => ({
      ...dpd,
      delivery_plan_id: planIdMap[dpd.delivery_plan_id] || dpd.delivery_plan_id
    }));

    const insertedPlanDetails = await queryInterface.bulkInsert('s_delivery_plan_details', finalPlanDetails, { ignoreDuplicates: true, returning: true });

    const finalOrders = deliveryOrders.map(doRecord => ({
      ...doRecord,
      delivery_plan_id: planIdMap[doRecord.delivery_plan_id] || doRecord.delivery_plan_id
    }));

    const insertedOrders = await queryInterface.bulkInsert('s_delivery_orders', finalOrders, { ignoreDuplicates: true, returning: true });

    // Populate Delivery Order Details
    const deliveryOrderDetails = [];
    insertedOrders.forEach(insertedOrder => {
      const planDetails = insertedPlanDetails.filter(ipd => ipd.delivery_plan_id === insertedOrder.delivery_plan_id);
      planDetails.forEach(pd => {
        deliveryOrderDetails.push({
          delivery_order_id: insertedOrder.id,
          delivery_plan_detail_id: pd.id,
          sent_qty: pd.planned_qty,
          received_qty: insertedOrder.delivery_status === 'Delivered' ? pd.planned_qty : null,
          notes: insertedOrder.delivery_status === 'Delivered' ? 'Diterima dengan baik' : null,
          ...timestamp
        });
      });
    });

    if (deliveryOrderDetails.length > 0) {
      await queryInterface.bulkInsert('s_delivery_order_details', deliveryOrderDetails, { ignoreDuplicates: true });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_delivery_order_details', null, {});
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
