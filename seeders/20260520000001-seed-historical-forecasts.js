/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const { Op } = Sequelize;
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    // ──────────────────────────────────────────────────────────────────────
    // CONFIG
    // ──────────────────────────────────────────────────────────────────────
    const YEARS        = [2023, 2024, 2025];
    const CUSTOMER_IDS = [1, 2, 3, 4, 5, 6];
    const PRODUCT_IDS  = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // 12 products from seed-parts

    // Seasonal reference data
    const BASE_QTY = [80, 100, 120, 90, 110, 130, 85, 115, 140, 95, 105, 125];
    const SEASONAL = [1.0, 0.9, 1.1, 1.2, 1.15, 1.3, 1.1, 0.95, 1.0, 1.2, 1.25, 1.4];
    const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // ──────────────────────────────────────────────────────────────────────
    // HELPERS
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Deterministic part selection per forecast.
     * Same inputs → same output on every seed run.
     */
    function selectParts(customerId, yearIndex, typeIndex) {
      const seed  = (customerId * 17 + yearIndex * 31 + typeIndex * 7) % 12;
      const count = 2 + (seed % 3); // 2, 3, or 4 parts
      return Array.from({ length: count }, (_, i) => PRODUCT_IDS[(seed + i) % 12]);
    }

    /** Pad number with leading zero */
    function pad(n) { return String(n).padStart(2, '0'); }

    /** Build a YYYY-MM-01 date string */
    function periodDate(year, monthIndex) {
      return `${year}-${pad(monthIndex + 1)}-01`;
    }

    /**
     * Compute forecast_qty for a given partId and month-of-year index (0–11).
     */
    function qty(partId, monthIndex) {
      const base   = BASE_QTY[(partId - 1) % BASE_QTY.length];
      const factor = SEASONAL[monthIndex];
      return Math.round(base * factor);
    }

    // ──────────────────────────────────────────────────────────────────────
    // BUILD FORECAST HEADER RECORDS
    // ──────────────────────────────────────────────────────────────────────
    const forecasts = [];

    for (let yi = 0; yi < YEARS.length; yi++) {
      const year = YEARS[yi];

      for (const custId of CUSTOMER_IDS) {
        // ── Yearly (typeIndex = 0) ────────────────────────────────────────
        forecasts.push({
          forecast_number: `FC-YR-${year}-C${custId}`,
          forecast_type:   'Yearly',
          customer_id:     custId,
          start_period:    `${year}-01-01`,
          end_period:      `${year}-12-01`,
          description:     `Historical Yearly Forecast ${year} — Customer ${custId}`,
          version:         'V1',
          status:          'Approved',
          created_by:      1,
          approved_by:     1,
          approved_at:     new Date(`${year}-12-15T08:00:00Z`),
          ...timestamp,
        });

        // ── Half-Year (typeIndex = 1, 2) ──────────────────────────────────
        forecasts.push({
          forecast_number: `FC-HY-${year}-H1-C${custId}`,
          forecast_type:   'Half-Year',
          customer_id:     custId,
          start_period:    `${year}-01-01`,
          end_period:      `${year}-06-01`,
          description:     `Historical Half-Year H1 Forecast ${year} — Customer ${custId}`,
          version:         'V1',
          status:          'Approved',
          created_by:      1,
          approved_by:     1,
          approved_at:     new Date(`${year}-06-15T08:00:00Z`),
          ...timestamp,
        });

        forecasts.push({
          forecast_number: `FC-HY-${year}-H2-C${custId}`,
          forecast_type:   'Half-Year',
          customer_id:     custId,
          start_period:    `${year}-07-01`,
          end_period:      `${year}-12-01`,
          description:     `Historical Half-Year H2 Forecast ${year} — Customer ${custId}`,
          version:         'V1',
          status:          'Approved',
          created_by:      1,
          approved_by:     1,
          approved_at:     new Date(`${year}-12-15T08:00:00Z`),
          ...timestamp,
        });

        // ── 4-Month (typeIndex = 3, 4, 5) ─────────────────────────────────
        const windows = [
          { label: 'W1', start: `${year}-01-01`, end: `${year}-04-01` },
          { label: 'W2', start: `${year}-05-01`, end: `${year}-08-01` },
          { label: 'W3', start: `${year}-09-01`, end: `${year}-12-01` },
        ];

        for (const w of windows) {
          forecasts.push({
            forecast_number: `FC-4M-${year}-${w.label}-C${custId}`,
            forecast_type:   '4-Month',
            customer_id:     custId,
            start_period:    w.start,
            end_period:      w.end,
            description:     `Historical 4-Month ${w.label} Forecast ${year} — Customer ${custId}`,
            version:         'V1',
            status:          'Approved',
            created_by:      1,
            approved_by:     1,
            approved_at:     new Date(`${w.end.slice(0, 7)}-15T08:00:00Z`),
            ...timestamp,
          });
        }
      }
    }

    // Insert all forecasts (ignoreDuplicates to be safe on re-seed)
    await queryInterface.bulkInsert('s_sales_forecasts', forecasts, { ignoreDuplicates: true });

    // ──────────────────────────────────────────────────────────────────────
    // FETCH INSERTED FORECAST IDS (needed for detail FK)
    // ──────────────────────────────────────────────────────────────────────
    const [insertedRows] = await queryInterface.sequelize.query(`
      SELECT id, forecast_number
      FROM s_sales_forecasts
      WHERE forecast_number LIKE 'FC-%-202%-C%'
        AND deleted_at IS NULL
    `);

    const fcNumberToId = Object.fromEntries(
      insertedRows.map(r => [r.forecast_number, r.id])
    );

    // ──────────────────────────────────────────────────────────────────────
    // BUILD DETAIL RECORDS
    // ──────────────────────────────────────────────────────────────────────
    const details = [];

    for (let yi = 0; yi < YEARS.length; yi++) {
      const year = YEARS[yi];

      for (let ci = 0; ci < CUSTOMER_IDS.length; ci++) {
        const custId = CUSTOMER_IDS[ci];

        // ── YEARLY details (12 months, all Temporary) ─────────────────────
        {
          const fcNum    = `FC-YR-${year}-C${custId}`;
          const fcId     = fcNumberToId[fcNum];
          const partIds  = selectParts(custId, yi, 0);

          if (fcId) {
            for (const partId of partIds) {
              for (let m = 0; m < 12; m++) {
                details.push({
                  forecast_id:            fcId,
                  forecast_detail_number: `${fcNum}-P${partId}-${MONTH_ABBR[m]}`,
                  part_id:                partId,
                  period_date:            periodDate(year, m),
                  qty_status:             'Temporary',
                  forecast_qty:           qty(partId, m),
                  ...timestamp,
                });
              }
            }
          }
        }

        // ── HALF-YEAR H1 details (Jan–Jun, all Temporary) ─────────────────
        {
          const fcNum    = `FC-HY-${year}-H1-C${custId}`;
          const fcId     = fcNumberToId[fcNum];
          const partIds  = selectParts(custId, yi, 1);

          if (fcId) {
            for (const partId of partIds) {
              for (let m = 0; m < 6; m++) { // Jan=0 … Jun=5
                details.push({
                  forecast_id:            fcId,
                  forecast_detail_number: `${fcNum}-P${partId}-${MONTH_ABBR[m]}`,
                  part_id:                partId,
                  period_date:            periodDate(year, m),
                  qty_status:             'Temporary',
                  forecast_qty:           qty(partId, m),
                  ...timestamp,
                });
              }
            }
          }
        }

        // ── HALF-YEAR H2 details (Jul–Dec, all Temporary) ─────────────────
        {
          const fcNum    = `FC-HY-${year}-H2-C${custId}`;
          const fcId     = fcNumberToId[fcNum];
          const partIds  = selectParts(custId, yi, 2);

          if (fcId) {
            for (const partId of partIds) {
              for (let m = 6; m < 12; m++) { // Jul=6 … Dec=11
                details.push({
                  forecast_id:            fcId,
                  forecast_detail_number: `${fcNum}-P${partId}-${MONTH_ABBR[m]}`,
                  part_id:                partId,
                  period_date:            periodDate(year, m),
                  qty_status:             'Temporary',
                  forecast_qty:           qty(partId, m),
                  ...timestamp,
                });
              }
            }
          }
        }

        // ── 4-MONTH windows (month[0]=Fix, months[1..3]=Temporary) ────────
        const windows4m = [
          { label: 'W1', typeIndex: 3, startMonth: 0 },  // Jan–Apr  (months 0–3)
          { label: 'W2', typeIndex: 4, startMonth: 4 },  // May–Aug  (months 4–7)
          { label: 'W3', typeIndex: 5, startMonth: 8 },  // Sep–Dec  (months 8–11)
        ];

        for (const w of windows4m) {
          const fcNum   = `FC-4M-${year}-${w.label}-C${custId}`;
          const fcId    = fcNumberToId[fcNum];
          const partIds = selectParts(custId, yi, w.typeIndex);

          if (fcId) {
            for (const partId of partIds) {
              for (let i = 0; i < 4; i++) {
                const m = w.startMonth + i;
                details.push({
                  forecast_id:            fcId,
                  forecast_detail_number: `${fcNum}-P${partId}-${MONTH_ABBR[m]}`,
                  part_id:                partId,
                  period_date:            periodDate(year, m),
                  qty_status:             i === 0 ? 'Fix' : 'Temporary',
                  forecast_qty:           qty(partId, m),
                  ...timestamp,
                });
              }
            }
          }
        }
      }
    }

    await queryInterface.bulkInsert('s_sales_forecast_details', details, { ignoreDuplicates: true });

    console.log(`[seed] Inserted ${forecasts.length} forecasts and ${details.length} detail rows.`);
  },

  async down(queryInterface, Sequelize) {
    // 1. Delete details belonging to our seeded forecasts
    await queryInterface.sequelize.query(`
      DELETE FROM s_sales_forecast_details
      WHERE forecast_id IN (
        SELECT id FROM s_sales_forecasts
        WHERE forecast_number LIKE 'FC-%-202%-C%'
      )
    `);

    // 2. Delete the forecast headers
    await queryInterface.bulkDelete(
      's_sales_forecasts',
      { forecast_number: { [Sequelize.Op.like]: 'FC-%-202%-C%' } },
      {}
    );
  },
};
