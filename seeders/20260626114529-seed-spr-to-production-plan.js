'use strict';

/**
 * SEEDER: SPR → SPO → SDP → SDO → Production Plan (Jan-Sep 2026)
 *
 * FLOW LENGKAP:
 *   SPR  → s_sales_purchase_requests + s_sales_purchase_request_details
 *   SPO  → s_sales_purchase_orders + s_sales_purchase_order_details
 *   SDP  → s_delivery_plans + s_delivery_plan_details
 *   SDO  → s_delivery_orders + s_delivery_order_details
 *   PP   → s_production_plans                          (Jan–Jun)
 *        → s_production_plan_capacity_params           (Jan–Jun)
 *        → s_production_plan_capacity_results          (Jan–Jun)  ← FIX: sebelumnya tidak ada
 *        → s_production_plan_details (do_id+do_detail_id+part_id) ← FIX: sebelumnya tidak ada
 *        → s_production_plan_calendar_adjustments      (Jan–May)
 */

export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const formatDate = (date) => date.toISOString().split('T')[0];

    /** Senin pekan ke-3 dan ke-4 dari bulan yang diberikan */
    function getDeliveryDates(year, month) {
      const firstDay  = new Date(year, month - 1, 1);
      const dayOfWeek = firstDay.getDay();
      const toMonday  = (8 - dayOfWeek) % 7;

      const week3Monday = new Date(firstDay);
      week3Monday.setDate(firstDay.getDate() + toMonday + 14);

      const week4Monday = new Date(week3Monday);
      week4Monday.setDate(week3Monday.getDate() + 7);

      return [formatDate(week3Monday), formatDate(week4Monday)];
    }

    console.log('[SEEDER] Initializing SPR → SPO → SDP → SDO → Production Plan seeder...\n');

    // ── 1. Master data ──────────────────────────────────────────────────────────
    console.log('[SEEDER] Loading master data...');

    const products = await queryInterface.sequelize.query(
      `SELECT id, part_number FROM s_parts
       WHERE part_type_code = 'PRODUCT' AND deleted_at IS NULL
       ORDER BY part_number ASC LIMIT 10;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const customers = await queryInterface.sequelize.query(
      `SELECT id FROM s_customers WHERE deleted_at IS NULL ORDER BY id LIMIT 6;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const lines = await queryInterface.sequelize.query(
      `SELECT id FROM s_lines WHERE deleted_at IS NULL ORDER BY id LIMIT 1;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const shifts = await queryInterface.sequelize.query(
      `SELECT id, shift_number FROM s_shifts
       WHERE type = 'REGULAR' AND active = true AND deleted_at IS NULL
       ORDER BY shift_number ASC;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const users = await queryInterface.sequelize.query(
      `SELECT id FROM s_users WHERE deleted_at IS NULL ORDER BY id LIMIT 1;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const warehouses = await queryInterface.sequelize.query(
      `SELECT id FROM s_warehouses WHERE deleted_at IS NULL ORDER BY id LIMIT 1;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const docks = await queryInterface.sequelize.query(
      `SELECT id FROM s_docks WHERE deleted_at IS NULL ORDER BY id LIMIT 1;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    // routing_id nullable di plan_details — fetch kalau ada, skip kalau tidak
    const routings = await queryInterface.sequelize.query(
      `SELECT id, part_id FROM s_part_routings
       WHERE active = true AND deleted_at IS NULL
       ORDER BY id ASC;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (
      products.length   === 0 ||
      customers.length  === 0 ||
      lines.length      === 0 ||
      users.length      === 0 ||
      warehouses.length === 0 ||
      docks.length      === 0
    ) {
      console.warn('⚠️  Missing required master data (products/customers/lines/users/warehouses/docks). Seeder stopped.');
      return;
    }

    const lineId      = lines[0].id;
    const userId      = users[0].id;
    const warehouseId = warehouses[0].id;
    const dockId      = docks[0].id;

    // Map part_id → routing_id (pakai routing pertama yang ditemukan per part)
    const routingByPartId = {};
    for (const r of routings) {
      if (!routingByPartId[r.part_id]) routingByPartId[r.part_id] = r.id;
    }

    console.log(
      `✅ Loaded: ${products.length} products, ${customers.length} customers, ` +
      `${lines.length} line(s), ${shifts.length} shift(s), ` +
      `${routings.length} routing(s), warehouse #${warehouseId}, dock #${dockId}\n`
    );

    const stats = {};

    // ── 2. Loop Jan–Sep 2026 ───────────────────────────────────────────────────
    for (let month = 1; month <= 9; month++) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋  MONTH ${month}/2026`);
      console.log(`${'='.repeat(60)}`);

      const [deliveryDate1, deliveryDate2] = getDeliveryDates(2026, month);
      stats[month] = { spr: 0, spo: 0, sdp: 0, sdo: 0, plan: 0, adj: 0 };

      // ── STEP 1: SPR ──────────────────────────────────────────────────────────
      console.log('\n▶ [1] Creating Sales Purchase Requests...');
      const sprData        = [];
      const sprDetailsData = [];
      let   sprSeq         = 1;
      const productLimit   = Math.min(products.length, 4);

      for (let p = 0; p < productLimit; p++) {
        const product      = products[p];
        const requiredDate = p % 2 === 0 ? deliveryDate1 : deliveryDate2;

        sprData.push({
          spr_number:     `SPR-2026-${String(month).padStart(2, '0')}-${String(sprSeq).padStart(4, '0')}`,
          spr_name:       `SPR ${product.part_number} Month ${month}`,
          source:         'Sales Forecast',
          request_date:   formatDate(now),
          required_date:  requiredDate,
          status:         'Confirmed',
          remarks:        `SPR for ${product.part_number}`,
          created_by:     userId,
          approved_by:    userId,
          confirmed_date: formatDate(now),
          created_at:     now,
          updated_at:     now,
        });
        sprDetailsData.push({
          part_id:    product.id,
          qty:        Math.floor(Math.random() * 100) + 50,
          created_at: now,
          updated_at: now,
        });
        sprSeq++;
      }

      await queryInterface.bulkInsert('s_sales_purchase_requests', sprData);
      stats[month].spr = sprData.length;

      const insertedSPRs = await queryInterface.sequelize.query(
        `SELECT id, required_date FROM s_sales_purchase_requests
         WHERE request_date = $1 AND status = 'Confirmed'
         ORDER BY id DESC LIMIT ${sprData.length};`,
        { bind: [formatDate(now)], type: Sequelize.QueryTypes.SELECT }
      );

      for (let i = 0; i < insertedSPRs.length; i++) {
        if (i < sprDetailsData.length) sprDetailsData[i].spr_id = insertedSPRs[i].id;
      }
      const validSPRDetails = sprDetailsData.filter(d => d.spr_id);
      if (validSPRDetails.length > 0) {
        await queryInterface.bulkInsert('s_sales_purchase_request_details', validSPRDetails);
      }
      console.log(`  ✓ ${sprData.length} SPR + ${validSPRDetails.length} detail(s)`);

      // ── STEP 2: SPO ──────────────────────────────────────────────────────────
      console.log('\n▶ [2] Creating Sales Purchase Orders...');
      const spoData        = [];
      const spoDetailsData = [];
      let   spoSeq         = 1;

      for (let i = 0; i < insertedSPRs.length; i++) {
        const spr      = insertedSPRs[i];
        const customer = customers[i % customers.length];
        const product  = products[i % products.length];

        spoData.push({
          spo_number:        `SPO-2026-${String(month).padStart(2, '0')}-${String(spoSeq).padStart(4, '0')}`,
          customer_id:       customer.id,
          spr_id:            spr.id,
          spo_date:          formatDate(now),
          delivery_due_date: spr.required_date,
          status:            'Confirmed',
          shipping_address:  `Address for customer ${customer.id}`,
          remarks:           `SPO for month ${month}`,
          created_by:        userId,
          created_at:        now,
          updated_at:        now,
        });
        spoDetailsData.push({
          part_id:     product.id,
          ordered_qty: Math.floor(Math.random() * 100) + 50,
          sent_qty:    0,
          status:      'Open',
          created_at:  now,
          updated_at:  now,
        });
        spoSeq++;
      }

      await queryInterface.bulkInsert('s_sales_purchase_orders', spoData);
      stats[month].spo = spoData.length;

      const insertedSPOs = await queryInterface.sequelize.query(
        `SELECT id, delivery_due_date FROM s_sales_purchase_orders
         WHERE spo_date = $1 AND status = 'Confirmed'
         ORDER BY id DESC LIMIT ${spoData.length};`,
        { bind: [formatDate(now)], type: Sequelize.QueryTypes.SELECT }
      );

      for (let i = 0; i < insertedSPOs.length; i++) {
        if (i < spoDetailsData.length) spoDetailsData[i].spo_id = insertedSPOs[i].id;
      }
      const validSPODetails = spoDetailsData.filter(d => d.spo_id);
      if (validSPODetails.length > 0) {
        await queryInterface.bulkInsert('s_sales_purchase_order_details', validSPODetails);
      }
      console.log(`  ✓ ${spoData.length} SPO + ${validSPODetails.length} detail(s)`);

      // ── STEP 3: SDP (Delivery Plans) ─────────────────────────────────────────
      console.log('\n▶ [3] Creating Delivery Plans...');
      const sdpData = [];
      let   sdpSeq  = 1;

      for (let i = 0; i < Math.min(insertedSPOs.length, 2); i++) {
        const spo = insertedSPOs[i];
        sdpData.push({
          dp_number:      `DP-2026-${String(month).padStart(2, '0')}-${String(sdpSeq).padStart(4, '0')}`,
          scheduled_date: spo.delivery_due_date,
          time_start:     '08:00:00',
          time_end:       '17:00:00',
          warehouse_id:   warehouseId,
          dock_id:        dockId,
          destination:    `Destination batch ${i + 1} month ${month}`,
          status:         'Confirmed',
          created_by:     userId,
          created_at:     now,
          updated_at:     now,
        });
        sdpSeq++;
      }

      await queryInterface.bulkInsert('s_delivery_plans', sdpData);
      stats[month].sdp = sdpData.length;

      const insertedSDPs = await queryInterface.sequelize.query(
        `SELECT id FROM s_delivery_plans
         WHERE scheduled_date >= $1 AND status = 'Confirmed'
         ORDER BY id DESC LIMIT ${sdpData.length};`,
        {
          bind: [formatDate(new Date(2026, month - 1, 1))],
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      // ── STEP 4: SDP Details ───────────────────────────────────────────────────
      console.log('\n▶ [4] Creating Delivery Plan Details...');
      const spoIdsThisMonth  = insertedSPOs.map(s => s.id);
      const spoDetailsForSDP = await queryInterface.sequelize.query(
        `SELECT id FROM s_sales_purchase_order_details
         WHERE spo_id IN (${spoIdsThisMonth.join(',')})
         ORDER BY id ASC LIMIT ${insertedSDPs.length * 3};`,
        { type: Sequelize.QueryTypes.SELECT }
      );

      const sdpDetailsData  = [];
      let   spoDetailCursor = 0;

      for (const sdp of insertedSDPs) {
        for (let j = 0; j < Math.min(3, spoDetailsForSDP.length - spoDetailCursor); j++) {
          sdpDetailsData.push({
            delivery_plan_id: sdp.id,
            spo_detail_id:    spoDetailsForSDP[spoDetailCursor].id,
            planned_qty:      Math.floor(Math.random() * 50) + 30,
            created_at:       now,
            updated_at:       now,
          });
          spoDetailCursor++;
        }
      }

      if (sdpDetailsData.length > 0) {
        await queryInterface.bulkInsert('s_delivery_plan_details', sdpDetailsData);
      }
      console.log(`  ✓ ${sdpDetailsData.length} SDP detail(s)`);

      const sdpIds             = insertedSDPs.map(s => s.id);
      const insertedSDPDetails = await queryInterface.sequelize.query(
        `SELECT id FROM s_delivery_plan_details
         WHERE delivery_plan_id IN (${sdpIds.join(',')})
         ORDER BY id ASC;`,
        { type: Sequelize.QueryTypes.SELECT }
      );

      // ── STEP 5: SDO (Delivery Orders + Details) ───────────────────────────────
      console.log('\n▶ [5] Creating Delivery Orders...');
      const sdoData = [];
      let   sdoSeq  = 1;

      for (let i = 0; i < insertedSDPs.length; i++) {
        const sdp      = insertedSDPs[i];
        const spo      = insertedSPOs[i] ?? insertedSPOs[0];
        const customer = customers[i % customers.length];

        sdoData.push({
          do_number:            `DO-2026-${String(month).padStart(2, '0')}-${String(sdoSeq).padStart(4, '0')}`,
          delivery_plan_id:     sdp.id,
          customer_id:          customer.id,
          vehicle_id:           (i % 3) + 1,
          driver_id:            (i % 3) + 1,
          shipment_date:        spo.delivery_due_date,
          delivery_status:      'Created',
          notes:                `SDO shipment batch ${String.fromCharCode(65 + i)}-${i + 1}`,
          created_by:           userId,
          dispatch_approved_by: userId,
          dispatch_approved_at: now,
          created_at:           now,
          updated_at:           now,
        });
        sdoSeq++;
      }

      await queryInterface.bulkInsert('s_delivery_orders', sdoData);
      stats[month].sdo = sdoData.length;

      const insertedSDOs = await queryInterface.sequelize.query(
        `SELECT id, customer_id, shipment_date FROM s_delivery_orders
         WHERE delivery_plan_id IN (${sdpIds.join(',')})
         ORDER BY id ASC;`,
        { type: Sequelize.QueryTypes.SELECT }
      );

      const sdoDetailsData  = [];
      let   sdpDetailCursor = 0;

      for (const sdo of insertedSDOs) {
        for (let j = 0; j < Math.min(3, insertedSDPDetails.length - sdpDetailCursor); j++) {
          sdoDetailsData.push({
            delivery_order_id:       sdo.id,
            delivery_plan_detail_id: insertedSDPDetails[sdpDetailCursor].id,
            sent_qty:                Math.floor(Math.random() * 50) + 30,
            notes:                   `Detail shipment ${j + 1}`,
            created_at:              now,
            updated_at:              now,
          });
          sdpDetailCursor++;
        }
      }

      if (sdoDetailsData.length > 0) {
        await queryInterface.bulkInsert('s_delivery_order_details', sdoDetailsData);
      }
      console.log(`  ✓ ${sdoData.length} SDO + ${sdoDetailsData.length} detail(s)`);

      // ── STEP 6–9: Production Plan dan turunannya (Jan–Jun saja) ──────────────
      if (month <= 6) {
        const [earliest, latest] = getDeliveryDates(2026, month);

        // STEP 6: Production Plan
        console.log('\n▶ [6] Creating Production Plan...');
        const planData = [{
          plan_number:            `PP-2026-${String(month).padStart(2, '0')}-00001`,
          plan_description:       `Production plan for month ${month}/2026`,
          earliest_delivery_date: earliest,
          latest_delivery_date:   latest,
          total_qty_capacity:     0,           // akan di-update di bawah setelah capacity dihitung
          status:                 month <= 5 ? 'Approved' : 'Draft',
          overall_status:         month <= 5 ? 'POSSIBLE' : 'Not_Calculated',
          plan_month:             `2026-${String(month).padStart(2, '0')}`,
          plan_type:              'ORIGINAL',
          notes:                  `Auto-seeded production plan month ${month}`,
          created_by:             userId,
          approved_by:            month <= 5 ? userId : null,
          approved_at:            month <= 5 ? now    : null,
          created_at:             now,
          updated_at:             now,
        }];

        await queryInterface.bulkInsert('s_production_plans', planData);
        stats[month].plan = 1;

        const [insertedPlan] = await queryInterface.sequelize.query(
          `SELECT id FROM s_production_plans
           WHERE plan_month = $1 AND plan_type = 'ORIGINAL'
           ORDER BY id DESC LIMIT 1;`,
          {
            bind: [`2026-${String(month).padStart(2, '0')}`],
            type: Sequelize.QueryTypes.SELECT,
          }
        );
        const planId = insertedPlan.id;

        // STEP 7: Capacity Params
        console.log('\n▶ [7] Adding Capacity Params...');
        const workingDays    = 20 + Math.floor(Math.random() * 3);
        const shiftsPerDay   = 3;
        const hoursPerShift  = 7.0;
        const efficiency     = 0.85;
        const maxTaktTime    = 2460;   // detik per unit

        await queryInterface.bulkInsert('s_production_plan_capacity_params', [{
          plan_id:                 planId,
          line_id:                 lineId,
          param_type:              'base',
          working_days:            workingDays,
          shifts_per_day:          shiftsPerDay,
          working_hours_per_shift: hoursPerShift,
          manpower:                15 + Math.floor(Math.random() * 10),
          efficiency_factor:       efficiency,
          overtime_hours:          0,
          max_takt_time:           maxTaktTime,
          created_at:              now,
          updated_at:              now,
        }]);
        console.log(`  ✓ Capacity params inserted`);

        // STEP 8: Capacity Results ← SEBELUMNYA TIDAK ADA
        console.log('\n▶ [8] Adding Capacity Results...');

        // Hitung kapasitas:
        //   total_available_seconds = working_days × shifts_per_day × hours_per_shift × 3600
        //   total_capacity_units    = floor(total_available_seconds / max_takt_time × efficiency)
        const totalAvailSec      = workingDays * shiftsPerDay * hoursPerShift * 3600;
        const totalCapacityUnits = Math.floor((totalAvailSec / maxTaktTime) * efficiency);
        const capacityPerHour    = Math.round((3600 / maxTaktTime) * efficiency * 100) / 100;

        // Hitung total demand dari SDO details bulan ini sebagai proxy qty_request
        const totalQtyDemand = sdoDetailsData.reduce((acc, d) => acc + d.sent_qty, 0);
        const capacityGap    = totalCapacityUnits - totalQtyDemand;
        const utilizationPct = totalCapacityUnits > 0
          ? Math.round((totalQtyDemand / totalCapacityUnits) * 10000) / 100
          : 0;
        const resultStatus   = utilizationPct >= 100 ? 'OVERLOAD'
                             : utilizationPct >= 80  ? 'TIGHT'
                             : 'POSSIBLE';

        await queryInterface.bulkInsert('s_production_plan_capacity_results', [{
          plan_id:              planId,
          line_id:              lineId,
          max_takt_time:        maxTaktTime,
          capacity_per_hour:    capacityPerHour,
          total_capacity_units: totalCapacityUnits,
          capacity_gap_units:   capacityGap,
          utilization_pct:      utilizationPct,
          status:               resultStatus,
          calculated_at:        now,
        }]);

        // Update total_qty_capacity di production plan
        await queryInterface.sequelize.query(
          `UPDATE s_production_plans SET total_qty_capacity = $1 WHERE id = $2;`,
          { bind: [totalCapacityUnits, planId] }
        );

        console.log(
          `  ✓ Capacity results: total_units=${totalCapacityUnits}, ` +
          `demand=${totalQtyDemand}, gap=${capacityGap}, ` +
          `utilization=${utilizationPct}%, status=${resultStatus}`
        );

        // STEP 9: Production Plan Details ← SEBELUMNYA TIDAK ADA
        console.log('\n▶ [9] Creating Production Plan Details...');

        // Ambil data lengkap SDO details: do_id, do_detail_id, customer_id, part_id, tanggal, qty
        // Join melalui: s_delivery_order_details → s_delivery_plan_details → s_spo_details
        const sdoIds = insertedSDOs.map(s => s.id);
        const sdoDetailsFull = await queryInterface.sequelize.query(
          `SELECT
             sdo.id            AS do_id,
             sdo.customer_id   AS customer_id,
             sdo.shipment_date AS delivery_date,
             sdod.id           AS do_detail_id,
             sdod.sent_qty     AS qty,
             spod.part_id      AS part_id
           FROM s_delivery_order_details sdod
           JOIN s_delivery_orders sdo
             ON sdo.id = sdod.delivery_order_id
           JOIN s_delivery_plan_details sdpd
             ON sdpd.id = sdod.delivery_plan_detail_id
           JOIN s_sales_purchase_order_details spod
             ON spod.id = sdpd.spo_detail_id
           WHERE sdod.delivery_order_id IN (${sdoIds.join(',')})
           ORDER BY sdod.id ASC;`,
          { type: Sequelize.QueryTypes.SELECT }
        );

        const planDetailsData = [];
        let   seq             = 1;

        for (const row of sdoDetailsFull) {
          const routingId    = routingByPartId[row.part_id] ?? null;
          const qtyRequest   = row.qty;
          const qtyCapacity  = Math.min(qtyRequest, totalCapacityUnits);
          const detailGap    = qtyCapacity - qtyRequest;
          const reqMinutes   = Math.ceil((qtyRequest * maxTaktTime) / 60);

          planDetailsData.push({
            plan_id:          planId,
            sequence:         seq,
            do_id:            row.do_id,
            do_detail_id:     row.do_detail_id,
            customer_id:      row.customer_id,
            part_id:          row.part_id,
            delivery_date:    row.delivery_date,
            qty_request:      qtyRequest,
            qty_capacity:     qtyCapacity,
            capacity_gap:     detailGap,
            status:           month <= 5 ? 'POSSIBLE' : 'Not_Calculated',
            routing_id:       routingId,
            assigned_line_id: lineId,
            required_minutes: reqMinutes,
            priority_level:   seq <= 3 ? 'HIGH' : 'NORMAL',
            notes:            `Auto-seeded from DO #${row.do_id}, part #${row.part_id}`,
            created_at:       now,
            updated_at:       now,
          });
          seq++;
        }

        if (planDetailsData.length > 0) {
          await queryInterface.bulkInsert('s_production_plan_details', planDetailsData);
        }
        console.log(`  ✓ ${planDetailsData.length} plan detail(s) (linked: do_id, do_detail_id, part_id)`);

        // STEP 10: Calendar Adjustments (Jan–May saja)
        if (month <= 5 && shifts.length >= 2) {
          console.log('\n▶ [10] Adding Calendar Adjustments...');
          const adjData = [];

          for (let d = 0; d < 2; d++) {
            adjData.push({
              plan_id:         planId,
              date:            formatDate(new Date(2026, month - 1, 10 + d * 5)),
              adjustment_type: 'ADD_SHIFT',
              shift_id:        shifts[0].id,
              reason:          'Production acceleration needed',
              created_at:      now,
              updated_at:      now,
            });
          }
          adjData.push({
            plan_id:          planId,
            date:             formatDate(new Date(2026, month - 1, 15)),
            adjustment_type:  'ADD_OVERTIME',
            shift_id:         (shifts[1] ?? shifts[0]).id,
            overtime_minutes: 120,
            reason:           'Extra capacity needed',
            created_at:       now,
            updated_at:       now,
          });

          await queryInterface.bulkInsert('s_production_plan_calendar_adjustments', adjData);
          stats[month].adj = adjData.length;
          console.log(`  ✓ ${adjData.length} calendar adjustment(s)`);
        }
      } // end if month <= 6

      // Summary per bulan
      console.log(`\n✅ Month ${month} Summary:`);
      console.log(
        `   SPR: ${stats[month].spr} | SPO: ${stats[month].spo} | ` +
        `SDP: ${stats[month].sdp} | SDO: ${stats[month].sdo}`
      );
      if (month <= 6) {
        console.log(`   Plan: ${stats[month].plan} | Adj: ${stats[month].adj}`);
      }
    } // end month loop

    // ── Final Summary ────────────────────────────────────────────────────────────
    console.log(`\n\n${'='.repeat(60)}`);
    console.log('📊 FINAL SEEDER SUMMARY (Jan-Sep 2026)');
    console.log(`${'='.repeat(60)}\n`);

    let totalSPR = 0, totalSPO = 0, totalSDP = 0, totalSDO = 0, totalPlan = 0, totalAdj = 0;
    for (let m = 1; m <= 9; m++) {
      totalSPR  += stats[m].spr;
      totalSPO  += stats[m].spo;
      totalSDP  += stats[m].sdp  ?? 0;
      totalSDO  += stats[m].sdo;
      totalPlan += stats[m].plan ?? 0;
      totalAdj  += stats[m].adj  ?? 0;
    }

    console.log(`Sales Purchase Requests   (SPR):         ${totalSPR}`);
    console.log(`Sales Purchase Orders     (SPO):         ${totalSPO}`);
    console.log(`Delivery Plans            (SDP):         ${totalSDP}`);
    console.log(`Sales Delivery Orders     (SDO):         ${totalSDO}`);
    console.log(`Production Plans          (PP) :         ${totalPlan}  (Jan–Jun)`);
    console.log(`  └ capacity_params             :         ${totalPlan}  each`);
    console.log(`  └ capacity_results            :         ${totalPlan}  each`);
    console.log(`  └ plan_details (DO+part link) :         per plan`);
    console.log(`Calendar Adjustments            :         ${totalAdj}  (Jan–May)\n`);
    console.log('✅ Seeder completed successfully!');
  },

  // ── DOWN ──────────────────────────────────────────────────────────────────────
  async down(queryInterface) {
    console.log('[DOWN] Rolling back seeder...');

    // Production plan — child dulu baru parent
    await queryInterface.sequelize.query(
      `DELETE FROM s_production_plan_calendar_adjustments
       WHERE plan_id IN (SELECT id FROM s_production_plans WHERE plan_month LIKE '2026-%');`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM s_production_plan_details
       WHERE plan_id IN (SELECT id FROM s_production_plans WHERE plan_month LIKE '2026-%');`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM s_production_plan_capacity_results
       WHERE plan_id IN (SELECT id FROM s_production_plans WHERE plan_month LIKE '2026-%');`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM s_production_plan_capacity_params
       WHERE plan_id IN (SELECT id FROM s_production_plans WHERE plan_month LIKE '2026-%');`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM s_production_plans WHERE plan_month LIKE '2026-%';`
    );

    // SDO → SDP
    await queryInterface.sequelize.query(
      `DELETE FROM s_delivery_order_details
       WHERE delivery_order_id IN (
         SELECT id FROM s_delivery_orders WHERE shipment_date >= '2026-01-01'
       );`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM s_delivery_orders WHERE shipment_date >= '2026-01-01';`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM s_delivery_plan_details
       WHERE delivery_plan_id IN (
         SELECT id FROM s_delivery_plans WHERE scheduled_date >= '2026-01-01'
       );`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM s_delivery_plans WHERE scheduled_date >= '2026-01-01';`
    );

    // SPO → SPR
    await queryInterface.sequelize.query(
      `DELETE FROM s_sales_purchase_order_details
       WHERE spo_id IN (
         SELECT id FROM s_sales_purchase_orders WHERE spo_date >= '2026-01-01'
       );`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM s_sales_purchase_orders WHERE spo_date >= '2026-01-01';`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM s_sales_purchase_request_details
       WHERE spr_id IN (
         SELECT id FROM s_sales_purchase_requests WHERE request_date >= '2026-01-01'
       );`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM s_sales_purchase_requests WHERE request_date >= '2026-01-01';`
    );

    console.log('🗑️  Rollback completed.');
  },
};