export default {
  async up(queryInterface, Sequelize) {

    // ── Helper: hitung hari kerja (Senin-Jumat) dalam satu bulan ──────────
    function countWorkingDays(year, month) {
      const start = new Date(year, month - 1, 1);
      const end   = new Date(year, month, 0);
      let count   = 0;
      const d     = new Date(start);
      while (d <= end) {
        if (d.getDay() !== 0 && d.getDay() !== 6) count++;
        d.setDate(d.getDate() + 1);
      }
      return count;
    }

    // ── Helper: calcNetMinutes (Diperbaiki agar sinkron dengan data shift baru) ──────
    // Net = Hanya SUM(PRODUCTIVE). BREAK tidak mengurangi lagi karena tidak overlap.
    function calcNetMinutes(shiftRows) {
      let productive = 0;
      for (const s of shiftRows) {
        // Hanya hitung jika kategorinya PRODUCTIVE
        if (s.category === 'PRODUCTIVE') {
          const [sh, sm] = s.start_time.split(':').map(Number);
          const [eh, em] = s.end_time.split(':').map(Number);
          let start = sh * 60 + sm;
          let end   = eh * 60 + em;
          if (end <= start) end += 24 * 60; // Antisipasi lintas tengah malam (Shift 3)
          
          const duration = end - start;
          productive += duration;
        }
      }
      return Math.max(0, productive);
    }

    // NON_OPERATOR_POSITIONS — konstanta pembatas manpower
    const NON_OPERATOR_POSITIONS = ['Group Leader', 'Foreman'];

    // ── 1. Ambil data lines ────────────────────────────────────────────────
    const lines = await queryInterface.sequelize.query(
      `SELECT id, line_code FROM s_lines WHERE deleted_at IS NULL ORDER BY id;`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (lines.length === 0) {
      console.warn('⚠️ Tidak ada data s_lines, seeder dihentikan.');
      return;
    }

    // ── 2. Ambil SEMUA segment shift REGULAR ──────────────────────────────
    const allRegularShifts = await queryInterface.sequelize.query(
      `SELECT id, shift_number, start_time::text, end_time::text, category
       FROM s_shifts
       WHERE type = 'REGULAR' AND active = true AND deleted_at IS NULL
       ORDER BY shift_number ASC, id ASC;`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (allRegularShifts.length === 0) {
      console.warn('⚠️ Tidak ada s_shifts REGULAR aktif, seeder dihentikan.');
      return;
    }
    console.log(`ℹ️  ${allRegularShifts.length} segment shift REGULAR (tiap segment = 1 row calendar/hari).`);

    // ── 3. Hitung shifts_per_day & working_hours_per_shift ─────────────────
    const shiftsPerDay       = new Set(allRegularShifts.map(s => s.shift_number)).size;
    const netMinPerDay       = calcNetMinutes(allRegularShifts);
    // Menghasilkan rata-rata jam kerja bersih yang logis (~7.33 jam per shift)
    const workingHrsPerShift = parseFloat((netMinPerDay / 60 / shiftsPerDay).toFixed(2));
    console.log(`ℹ️  shifts_per_day=${shiftsPerDay}, net_min/day=${netMinPerDay}, working_hrs_per_shift=${workingHrsPerShift}`);

    // ── 4. Hitung actual manpower & max_takt_time per line ─────────────────
    const lineActualMap = {}; 

    for (const line of lines) {
      // ── Manpower: query member aktif beserta nama posisinya ───────────────
      // GANTI dengan query langsung ke s_employees via s_stations:
      const members = await queryInterface.sequelize.query(
        `SELECT e.id, e.position_name
        FROM s_employees e
        WHERE e.active = true
          AND e.deleted_at IS NULL
          AND e.position_name IS NOT NULL;`,
        { type: Sequelize.QueryTypes.SELECT }
      );

      const totalOperators = members.filter(m => {
        const pos = (m.position_name ?? '').toLowerCase();
        return !NON_OPERATOR_POSITIONS.some(nonOp =>
          pos.includes(nonOp.toLowerCase())
        );
      }).length;

      // ── Max Takt Time: hitung per station, ambil tertinggi ────────────────
      const stationTaktTimes = await queryInterface.sequelize.query(
        `SELECT st.id AS station_id,
                COALESCE(SUM(j.standard_time), 0) AS takt_time
         FROM s_stations st
         LEFT JOIN s_station_jobs sj ON sj.station_id = st.id
                                      AND sj.active = true
                                      AND sj.deleted_at IS NULL
         LEFT JOIN s_jobs j          ON j.id = sj.job_id
                                      AND j.active = true
                                      AND j.deleted_at IS NULL
         WHERE st.line_id    = ${line.id}
           AND st.status     = true
           AND st.deleted_at IS NULL
         GROUP BY st.id;`,
        { type: Sequelize.QueryTypes.SELECT }
      );

      const maxTaktTime = stationTaktTimes.length > 0
        ? Math.max(...stationTaktTimes.map(s => parseInt(s.takt_time, 10)))
        : 0;

      lineActualMap[line.id] = {
        manpower: totalOperators,
        max_takt: maxTaktTime,
      };

      console.log(`ℹ️  Line ${line.line_code}: manpower=${totalOperators}, max_takt=${maxTaktTime}s`);
    }

    // ── 5. Ambil ref_type_calendar (Working Day) ───────────────────────────
    const typeCalendars = await queryInterface.sequelize.query(
      `SELECT id FROM ref_type_calendars WHERE is_holiday = false AND deleted_at IS NULL LIMIT 1;`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const typeCalendarId = typeCalendars.length > 0 ? typeCalendars[0].id : 1;

    const now       = new Date();
    const periods   = [
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ];
    const startDate = new Date('2026-05-01T00:00:00');
    const endDate   = new Date('2026-07-31T23:59:59');

    // ── 6. Insert Shift Calendars ──────────────────────────────────────────
    const shiftCalendars = [];
    for (const line of lines) {
      for (const seg of allRegularShifts) {
        let cur = new Date(startDate);
        while (cur <= endDate) {
          if (cur.getDay() !== 0 && cur.getDay() !== 6) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;
            shiftCalendars.push({
              line_id:              line.id,
              shift_id:             seg.id,
              start_date:           dateStr,
              end_date:             dateStr,
              ref_type_calendar_id: typeCalendarId,
              date_event:           dateStr,
              active:               true,
              created_at:           now,
              updated_at:           now,
            });
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }

    if (shiftCalendars.length > 0) {
      await queryInterface.bulkInsert('s_shift_calendars', shiftCalendars, {});
      console.log(
        `✅ Insert ${shiftCalendars.length} shift calendars ` +
        `(${lines.length} lines × ${allRegularShifts.length} segments × ~hari kerja Mei–Jul 2026).`
      );
    }

    // ── 7. Insert Line Capacity Params ─────────────────────────────────────
    const capacityRows = [];
    for (const line of lines) {
      const actual = lineActualMap[line.id];

      if (!actual) {
        console.warn(`⚠️ Tidak ada actual data untuk line '${line.line_code}', skip.`);
        continue;
      }
      if (actual.manpower === 0) {
        console.warn(`⚠️ Line '${line.line_code}' belum ada operator aktif, capacity params diisi manpower=0.`);
      }
      if (actual.max_takt === 0) {
        console.warn(`⚠️ Line '${line.line_code}' belum ada job aktif, capacity params diisi max_takt=0.`);
      }

      for (const { year, month } of periods) {
        const workingDays = countWorkingDays(year, month);

        const existing = await queryInterface.sequelize.query(
          `SELECT id FROM s_line_capacity_params
           WHERE line_id = ${line.id} AND param_year = ${year} AND param_month = ${month}
           LIMIT 1;`,
          { type: Sequelize.QueryTypes.SELECT }
        );
        if (existing.length > 0) {
          console.log(`⏭️  Skip ${line.line_code} ${year}-${String(month).padStart(2, '0')} (sudah ada).`);
          continue;
        }

        capacityRows.push({
          line_id:                         line.id,
          param_year:                      year,
          param_month:                     month,
          default_working_days:            workingDays,
          default_shifts_per_day:          shiftsPerDay,
          default_working_hours_per_shift: workingHrsPerShift,
          default_efficiency_factor:       0.85,
          default_overtime_hours:          0,
          default_manpower:                actual.manpower,
          default_max_takt_time:           actual.max_takt,
          created_at:                      now,
          updated_at:                      now,
        });
      }
    }

    if (capacityRows.length > 0) {
      await queryInterface.bulkInsert('s_line_capacity_params', capacityRows, {});
      console.log(
        `✅ Insert ${capacityRows.length} baris line capacity params ` +
        `(${lines.length} lines × ${periods.length} periode | ` +
        `shifts/day=${shiftsPerDay}, hrs/shift=${workingHrsPerShift}).`
      );
    } else {
      console.log('ℹ️  Tidak ada baris capacity baru yang perlu di-insert.');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `DELETE FROM s_line_capacity_params
       WHERE param_year = 2026 AND param_month IN (5, 6, 7);`
    );
    console.log('🗑️ Berhasil menghapus s_line_capacity_params (Mei–Juli 2026).');

    await queryInterface.bulkDelete('s_shift_calendars', {
      start_date: { [Sequelize.Op.between]: ['2026-05-01', '2026-07-31'] }
    }, {});
    console.log('🗑️ Berhasil menghapus s_shift_calendars (Mei–Juli 2026).');
  }
};