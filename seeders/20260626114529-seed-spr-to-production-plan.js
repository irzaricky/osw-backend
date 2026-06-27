'use strict';

/**
 * SEEDER: SPR → SPO → SDP → SDO → Production Plan (Jan-Sep 2026)
 *
 * Alur: Sales Purchase Request → Sales Purchase Order → Sales Delivery Plan → Sales Delivery Order → Production Plan
 *
 * SCENARIO:
 * - Jan-May: SPR → SPO → SDP → SDO → Production Plan (dengan adjustments) → Production Order Schedule (draft)
 * - Jun: SPR → SPO → SDP → SDO → Production Plan (status Draft, no adjustments)
 * - Jul-Sep: SPR → SPO → SDP → SDO only (tanpa Production Plan)
 *
 * Delivery dates: 3rd & 4th week setiap bulan
 * Products: Semua PRODUCT part dari s_parts
 */
export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // ── Helper functions ────────────────────────────────────────────────────
    
    const formatDate = (date) => date.toISOString().split('T')[0];

    // Get delivery dates (3rd & 4th week of month)
    function getDeliveryDates(year, month) {
      const firstDay = new Date(year, month - 1, 1);
      const dayOfWeek = firstDay.getDay();
      
      // Hitung hari pertama minggu ke-3 (hari Senin minggu ke-3)
      let daysUntilMonday = (8 - dayOfWeek) % 7;
      let thirdWeekMonday = new Date(firstDay);
      thirdWeekMonday.setDate(firstDay.getDate() + daysUntilMonday + 14); // +14 untuk minggu ke-3
      
      let fourthWeekMonday = new Date(thirdWeekMonday);
      fourthWeekMonday.setDate(fourthWeekMonday.getDate() + 7);
      
      return [
        formatDate(thirdWeekMonday),
        formatDate(fourthWeekMonday),
      ];
    }

    console.log('[SEEDER] Initializing SPR → SPO → SDP → SDO → Production Plan seeder...\n');

    // ── 1. Fetch data master ────────────────────────────────────────────────
    console.log('[SEEDER] Loading master data...');
    
    // Products (PRODUCT type only)
    const [products] = await queryInterface.sequelize.query(
      `SELECT id, part_number FROM s_parts 
       WHERE part_type_code = 'PRODUCT' AND deleted_at IS NULL
       ORDER BY part_number ASC;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    // Customers (untuk delivery order)
    const [customers] = await queryInterface.sequelize.query(
      `SELECT id FROM s_customers WHERE deleted_at IS NULL ORDER BY id LIMIT 6;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    // Lines
    const [lines] = await queryInterface.sequelize.query(
      `SELECT id FROM s_lines WHERE deleted_at IS NULL ORDER BY id LIMIT 1;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    // Shifts (untuk calendar adjustment)
    const [shifts] = await queryInterface.sequelize.query(
      `SELECT id, shift_number FROM s_shifts 
       WHERE type = 'REGULAR' AND active = true AND deleted_at IS NULL
       ORDER BY shift_number ASC;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (products.length === 0 || customers.length === 0 || lines.length === 0) {
      console.warn('⚠️ Missing master data (products, customers, lines). Seeder stopped.');
      return;
    }

    console.log(`✅ Loaded: ${products.length} products, ${customers.length} customers, ${lines.length} line(s), ${shifts.length} shift(s)\n`);

    const lineId = lines[0].id;
    const productMap = Object.fromEntries(products.map(p => [p.part_number, p.id]));

    // ── 2. Generate data untuk setiap bulan (Jan-Sep) ──────────────────────
    const stats = {};

    for (let month = 1; month <= 9; month++) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 MONTH ${month}/2026`);
      console.log(`${'='.repeat(60)}`);

      const [deliveryDate1, deliveryDate2] = getDeliveryDates(2026, month);
      
      stats[month] = { spr: 0, spo: 0, sdp: 0, sdo: 0, plan: 0, adj: 0 };

      // ── STEP 1: Create SPR (Sales Purchase Requests) ─────────────────────
      console.log(`\n▶ Creating Sales Purchase Requests...`);
      const sprData = [];
      let sprSeq = 1;

      for (let p = 0; p < products.length; p++) {
        const product = products[p];
        const deliveryDate = p % 2 === 0 ? deliveryDate1 : deliveryDate2;
        
        sprData.push({
          spr_number:     `SPR-2026-${String(month).padStart(2, '0')}-${String(sprSeq).padStart(4, '0')}`,
          spr_date:       formatDate(now),
          delivery_date:  deliveryDate,
          status:         'Confirmed',
          notes:          `SPR for ${product.part_number} - Month ${month}`,
          created_by:     1,
          approved_by:    1,
          approved_at:    now,
          created_at:     now,
          updated_at:     now,
        });
        sprSeq++;
      }

      await queryInterface.bulkInsert('s_sales_purchase_requests', sprData);
      stats[month].spr = sprData.length;
      console.log(`  ✓ ${sprData.length} SPR created`);

      // Fetch inserted SPRs
      const [insertedSPRs] = await queryInterface.sequelize.query(
        `SELECT id, spr_number, delivery_date FROM s_sales_purchase_requests 
         WHERE spr_date = $1 AND status = 'Confirmed'
         ORDER BY id DESC LIMIT ${sprData.length};`,
        { 
          bind: [formatDate(now)],
          type: Sequelize.QueryTypes.SELECT 
        }
      );

      // ── STEP 2: Create SPO (Sales Purchase Orders) from SPR ──────────────
      console.log(`\n▶ Creating Sales Purchase Orders...`);
      const spoData = [];
      let spoSeq = 1;

      for (let i = 0; i < insertedSPRs.length; i++) {
        const spr = insertedSPRs[i];
        const product = products[i % products.length];
        const qty = Math.floor(Math.random() * 100) + 50; // 50-150 units

        spoData.push({
          spr_id:         spr.id,
          po_number:      `SPO-2026-${String(month).padStart(2, '0')}-${String(spoSeq).padStart(4, '0')}`,
          po_date:        formatDate(now),
          delivery_date:  spr.delivery_date,
          status:         'Confirmed',
          notes:          `SPO for ${product.part_number}`,
          created_by:     1,
          approved_by:    1,
          approved_at:    now,
          created_at:     now,
          updated_at:     now,
        });
        spoSeq++;
      }

      await queryInterface.bulkInsert('s_sales_purchase_orders', spoData);
      stats[month].spo = spoData.length;
      console.log(`  ✓ ${spoData.length} SPO created`);

      // Fetch inserted SPOs
      const [insertedSPOs] = await queryInterface.sequelize.query(
        `SELECT id, delivery_date FROM s_sales_purchase_orders 
         WHERE po_date = $1 AND status = 'Confirmed'
         ORDER BY id DESC LIMIT ${spoData.length};`,
        { 
          bind: [formatDate(now)],
          type: Sequelize.QueryTypes.SELECT 
        }
      );

      // ── STEP 3: Create SDP (Sales Delivery Plans) from SPO ───────────────
      console.log(`\n▶ Creating Sales Delivery Plans...`);
      const sdpData = [];

      for (let i = 0; i < Math.min(insertedSPOs.length, 2); i++) {
        const spo = insertedSPOs[i];
        
        sdpData.push({
          spo_id:            spo.id,
          delivery_plan_num: `SDP-2026-${String(month).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`,
          plan_date:         formatDate(now),
          earliest_delivery: spo.delivery_date,
          latest_delivery:   spo.delivery_date,
          status:            'Confirmed',
          notes:             `SDP for month ${month}`,
          created_by:        1,
          created_at:        now,
          updated_at:        now,
        });
      }

      if (sdpData.length > 0) {
        await queryInterface.bulkInsert('s_sales_delivery_plans', sdpData);
        stats[month].sdp = sdpData.length;
        console.log(`  ✓ ${sdpData.length} SDP created`);
      }

      // Fetch inserted SDPs
      const [insertedSDPs] = await queryInterface.sequelize.query(
        `SELECT id, earliest_delivery, latest_delivery FROM s_sales_delivery_plans 
         WHERE plan_date = $1 AND status = 'Confirmed'
         ORDER BY id DESC LIMIT ${sdpData.length};`,
        { 
          bind: [formatDate(now)],
          type: Sequelize.QueryTypes.SELECT 
        }
      );

      // ── STEP 4: Create SDO (Sales Delivery Orders) from SDP ──────────────
      console.log(`\n▶ Creating Sales Delivery Orders...`);
      const sdoData = [];
      const sdoDetailsData = [];
      let sdoSeq = 1;

      for (let i = 0; i < insertedSDPs.length; i++) {
        const sdp = insertedSDPs[i];
        const customerId = customers[i % customers.length].id;
        
        sdoData.push({
          do_number:       `DO-2026-${String(month).padStart(2, '0')}-${String(sdoSeq).padStart(4, '0')}`,
          delivery_plan_id: sdp.id,
          customer_id:     customerId,
          vehicle_id:      (i % 3) + 1,
          driver_id:       (i % 3) + 1,
          shipment_date:   sdp.latest_delivery,
          delivery_status: 'Scheduled',
          notes:           `SDO shipment batch ${String.fromCharCode(65 + i)}-${i + 1}`,
          created_by:      1,
          dispatch_approved_by: 1,
          dispatch_approved_at: now,
          created_at:      now,
          updated_at:      now,
        });
        
        // SDO Details
        for (let p = 0; p < Math.min(3, products.length); p++) {
          const qty = Math.floor(Math.random() * 50) + 30;
          sdoDetailsData.push({
            sent_qty:    qty,
            notes:       `Detail shipment ${String.fromCharCode(65 + i)}-${p + 1}`,
            created_at:  now,
            updated_at:  now,
          });
        }
        
        sdoSeq++;
      }

      if (sdoData.length > 0) {
        await queryInterface.bulkInsert('s_delivery_orders', sdoData);
        stats[month].sdo = sdoData.length;
        console.log(`  ✓ ${sdoData.length} SDO created`);

        // Link SDO details
        const [insertedSDOs] = await queryInterface.sequelize.query(
          `SELECT id FROM s_delivery_orders 
           WHERE delivery_plan_id IN (
             SELECT id FROM s_sales_delivery_plans WHERE plan_date = $1
           )
           ORDER BY id DESC LIMIT ${sdoData.length};`,
          { 
            bind: [formatDate(now)],
            type: Sequelize.QueryTypes.SELECT 
          }
        );

        let detailIdx = 0;
        for (let i = 0; i < insertedSDOs.length && detailIdx < sdoDetailsData.length; i++) {
          for (let j = 0; j < 3 && detailIdx < sdoDetailsData.length; j++) {
            sdoDetailsData[detailIdx].delivery_order_id = insertedSDOs[i].id;
            detailIdx++;
          }
        }

        await queryInterface.bulkInsert('s_delivery_order_details', 
          sdoDetailsData.filter(d => d.delivery_order_id)
        );
      }

      // ── STEP 5: Create Production Plans (Jan-Jun only) ───────────────────
      if (month <= 6) {
        console.log(`\n▶ Creating Production Plans...`);
        
        const planData = [];
        let planSeq = 1;

        // Create 1-2 production plans per month
        for (let i = 0; i < Math.min(insertedSDPs.length, 2); i++) {
          const sdp = insertedSDPs[i];
          
          planData.push({
            plan_number:            `PP-2026-${String(month).padStart(2, '0')}-${String(planSeq).padStart(5, '0')}`,
            earliest_delivery_date: sdp.earliest_delivery,
            latest_delivery_date:   sdp.latest_delivery,
            status:                 month <= 5 ? 'Approved' : 'Draft',
            overall_status:         month <= 5 ? 'POSSIBLE' : 'Not_Calculated',
            plan_month:             `2026-${String(month).padStart(2, '0')}`,
            plan_type:              'ORIGINAL',
            notes:                  `Production plan for month ${month}`,
            created_by:             1,
            approved_by:            month <= 5 ? 1 : null,
            approved_at:            month <= 5 ? now : null,
            created_at:             now,
            updated_at:             now,
          });
          planSeq++;
        }

        if (planData.length > 0) {
          await queryInterface.bulkInsert('s_production_plans', planData);
          stats[month].plan = planData.length;
          console.log(`  ✓ ${planData.length} Production Plan(s) created`);

          // Fetch inserted plans
          const [insertedPlans] = await queryInterface.sequelize.query(
            `SELECT id FROM s_production_plans 
             WHERE plan_month = $1 AND plan_type = 'ORIGINAL'
             ORDER BY id DESC LIMIT ${planData.length};`,
            { 
              bind: [`2026-${String(month).padStart(2, '0')}`],
              type: Sequelize.QueryTypes.SELECT 
            }
          );

          // ── STEP 6: Add Capacity Params untuk Production Plans ────────────
          console.log(`\n▶ Adding Capacity Parameters...`);
          const capacityParamData = [];

          for (const plan of insertedPlans) {
            capacityParamData.push({
              plan_id:                  plan.id,
              line_id:                  lineId,
              param_type:               'base',
              working_days:             20 + Math.floor(Math.random() * 3),
              shifts_per_day:           3,
              working_hours_per_shift:  7.00,
              manpower:                 15 + Math.floor(Math.random() * 10),
              efficiency_factor:        0.85,
              overtime_hours:           0,
              max_takt_time:            2460,
              created_at:               now,
              updated_at:               now,
            });
          }

          await queryInterface.bulkInsert('s_production_plan_capacity_params', capacityParamData);
          console.log(`  ✓ ${capacityParamData.length} capacity param(s) added`);

          // ── STEP 7: Add Calendar Adjustments (Jan-May only) ──────────────
          if (month <= 5) {
            console.log(`\n▶ Adding Calendar Adjustments...`);
            const adjData = [];

            for (const plan of insertedPlans) {
              // ADD_SHIFT untuk 1-2 hari
              for (let d = 0; d < 2; d++) {
                const adjDate = new Date(2026, month - 1, 10 + d * 5);
                adjData.push({
                  plan_id:          plan.id,
                  date:             formatDate(adjDate),
                  adjustment_type:  'ADD_SHIFT',
                  shift_id:         shifts[0].id,
                  reason:           'Production acceleration needed',
                  created_at:       now,
                  updated_at:       now,
                });
              }

              // ADD_OVERTIME untuk 1 entry
              const otDate = new Date(2026, month - 1, 15);
              adjData.push({
                plan_id:          plan.id,
                date:             formatDate(otDate),
                adjustment_type:  'ADD_OVERTIME',
                shift_id:         shifts[1].id,
                overtime_minutes: 120,
                reason:           'Extra capacity needed',
                created_at:       now,
                updated_at:       now,
              });
            }

            await queryInterface.bulkInsert('s_production_plan_calendar_adjustments', adjData);
            stats[month].adj = adjData.length;
            console.log(`  ✓ ${adjData.length} calendar adjustment(s) added`);
          }
        }
      }

      // ── Log summary untuk bulan ini ──────────────────────────────────
      console.log(`\n✅ Month ${month} Summary:`);
      console.log(`   SPR: ${stats[month].spr} | SPO: ${stats[month].spo} | SDP: ${stats[month].sdp} | SDO: ${stats[month].sdo}`);
      if (month <= 6) {
        console.log(`   Plan: ${stats[month].plan} | Adjustments: ${stats[month].adj}`);
      }
    }

    // ── Final Summary ────────────────────────────────────────────────────
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`📊 FINAL SEEDER SUMMARY (Jan-Sep 2026)`);
    console.log(`${'='.repeat(60)}\n`);

    let totalSPR = 0, totalSPO = 0, totalSDP = 0, totalSDO = 0, totalPlan = 0, totalAdj = 0;

    for (let m = 1; m <= 9; m++) {
      totalSPR += stats[m].spr;
      totalSPO += stats[m].spo;
      totalSDP += stats[m].sdp;
      totalSDO += stats[m].sdo;
      totalPlan += stats[m].plan;
      totalAdj += stats[m].adj;
    }

    console.log(`Sales Purchase Requests (SPR):      ${totalSPR}`);
    console.log(`Sales Purchase Orders (SPO):        ${totalSPO}`);
    console.log(`Sales Delivery Plans (SDP):         ${totalSDP}`);
    console.log(`Sales Delivery Orders (SDO):        ${totalSDO}`);
    console.log(`Production Plans (PP):              ${totalPlan} (Jan-Jun only)`);
    console.log(`Calendar Adjustments:               ${totalAdj} (Jan-May only)\n`);

    console.log(`✅ Seeder completed successfully!`);
  },

  async down(queryInterface, Sequelize) {
    console.log('[DOWN] Rolling back SPR → SPO → SDP → SDO → Plan seeder...');
    
    // Delete in reverse order of dependencies
    await queryInterface.sequelize.query(`DELETE FROM s_production_plan_calendar_adjustments WHERE plan_id IN (SELECT id FROM s_production_plans WHERE plan_month LIKE '2026-%');`);
    await queryInterface.sequelize.query(`DELETE FROM s_production_plan_capacity_params WHERE plan_id IN (SELECT id FROM s_production_plans WHERE plan_month LIKE '2026-%');`);
    await queryInterface.sequelize.query(`DELETE FROM s_production_plans WHERE plan_month LIKE '2026-%';`);
    
    await queryInterface.sequelize.query(`DELETE FROM s_delivery_order_details WHERE delivery_order_id IN (SELECT id FROM s_delivery_orders WHERE shipment_date >= '2026-01-01');`);
    await queryInterface.sequelize.query(`DELETE FROM s_delivery_orders WHERE shipment_date >= '2026-01-01';`);
    
    await queryInterface.sequelize.query(`DELETE FROM s_sales_delivery_plans WHERE plan_date >= '2026-01-01';`);
    
    await queryInterface.sequelize.query(`DELETE FROM s_sales_purchase_orders WHERE po_date >= '2026-01-01';`);
    
    await queryInterface.sequelize.query(`DELETE FROM s_sales_purchase_requests WHERE spr_date >= '2026-01-01';`);
    
    console.log('🗑️ Rollback completed.');
  },
};