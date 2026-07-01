export default {
  async up(queryInterface, Sequelize) {
    // ── Helper: count working days per month (excluding weekend & holiday) ──
    function countWorkingDays(year, month, excludeDates = []) {
      const start = new Date(year, month - 1, 1);
      const end   = new Date(year, month, 0);
      let count   = 0;
      const d     = new Date(start);
      
      while (d <= end) {
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const dateStr   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const isHoliday = excludeDates.includes(dateStr);
        
        if (!isWeekend && !isHoliday) {
          count++;
        }
        d.setDate(d.getDate() + 1);
      }
      return count;
    }

    // ── Helper: calc net productive minutes dari shifts ─────────────────────
    function calcNetMinutes(shiftRows) {
      let productive = 0;
      for (const s of shiftRows) {
        if (s.category === 'PRODUCTIVE') {
          const [sh, sm] = s.start_time.split(':').map(Number);
          const [eh, em] = s.end_time.split(':').map(Number);
          let start = sh * 60 + sm;
          let end   = eh * 60 + em;
          if (end <= start) end += 24 * 60;
          productive += (end - start);
        }
      }
      return Math.max(0, productive);
    }

    // ── HARI LIBUR NASIONAL INDONESIA 2026 ──────────────────────────────────
    const nationalHolidays2026 = [
      '2026-01-01', // Hari Tahun Baru Masehi
      '2026-02-08', // Isra & Miraj
      '2026-02-14', // Cuti Bersama
      '2026-02-15', // Cuti Bersama
      '2026-02-16', // Cuti Bersama
      '2026-03-11', // Hari Raya Nyepi (Imlek 2577)
      '2026-03-28', // Cuti Bersama (sebelum Lebaran)
      '2026-03-29', // Cuti Bersama (sebelum Lebaran)
      '2026-03-30', // Hari Raya Idul Fitri
      '2026-03-31', // Hari Raya Idul Fitri
      '2026-04-01', // Cuti Bersama (sesudah Lebaran)
      '2026-04-02', // Cuti Bersama (sesudah Lebaran)
      '2026-04-10', // Hari Jumat Agung (Good Friday)
      '2026-04-12', // Hari Pasca Paskah
      '2026-04-14', // Hari Raya Idul Adha (Kurban)
      '2026-05-01', // Hari Buruh Internasional
      '2026-05-04', // Tahun Baru Imlek
      '2026-05-14', // Hari Kenaikan Isa Al-Masih
      '2026-05-16', // Cuti Bersama (Whit Sunday)
      '2026-05-17', // Hari Raya Waisak
      '2026-06-01', // Hari Lahir Pancasila
      '2026-07-07', // Awal Tahun Hijriyah 1448 H
      '2026-08-17', // Hari Kemerdekaan RI
      '2026-09-16', // Hari Raya Haji (Mawlid Nabi Muhammad)
      '2026-09-17', // Cuti Bersama
      '2026-11-25', // Hari Raya Nyepi Tahun Baru Imlek Bali
      '2026-12-25', // Hari Raya Natal
      '2026-12-26', // Cuti Bersama
      '2026-12-31', // Cuti Bersama (akhir tahun)
    ];

    const NON_OPERATOR_POSITIONS = ['Group Leader', 'Foreman'];

    // ── 1. Fetch data dari database ──────────────────────────────────────────
    console.log('[CALENDAR] Loading lines...');
    const lines = await queryInterface.sequelize.query(
      `SELECT id, line_code FROM s_lines WHERE deleted_at IS NULL ORDER BY id;`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (lines.length === 0) {
      console.warn('⚠️ Tidak ada data s_lines, seeder dihentikan.');
      return;
    }
    console.log(`✅ Loaded ${lines.length} lines.`);

    console.log('[CALENDAR] Loading shifts (ALL segments - untuk calc net minutes)...');
    const allShiftSegments = await queryInterface.sequelize.query(
      `SELECT id, shift_number, start_time::text, end_time::text, category
       FROM s_shifts
       WHERE type = 'REGULAR' AND active = true AND deleted_at IS NULL
       ORDER BY shift_number ASC, id ASC;`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (allShiftSegments.length === 0) {
      console.warn('⚠️ Tidak ada s_shifts REGULAR aktif, seeder dihentikan.');
      return;
    }
    console.log(`✅ Loaded ${allShiftSegments.length} shift segments.`);

    console.log('[CALENDAR] Loading shifts (UNIQUE shift_number - untuk insert calendar)...');
    const uniqueShiftNumbers = await queryInterface.sequelize.query(
      `SELECT DISTINCT shift_number FROM s_shifts
       WHERE type = 'REGULAR' AND active = true AND deleted_at IS NULL
       ORDER BY shift_number ASC;`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const shiftsPerDay = uniqueShiftNumbers.length;
    console.log(`✅ Found ${shiftsPerDay} unique shift numbers: ${uniqueShiftNumbers.map(r => r.shift_number).join(', ')}`);

    // Build map: shift_number → shift_id
    const shiftIdByNumber = {};
    for (const seg of allShiftSegments) {
      if (!shiftIdByNumber[seg.shift_number]) {
        shiftIdByNumber[seg.shift_number] = seg.id;
      }
    }

    console.log('[CALENDAR] Loading calendar types...');
    const calendarTypes = await queryInterface.sequelize.query(
      `SELECT id, code FROM ref_type_calendars WHERE deleted_at IS NULL ORDER BY id;`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const calendarTypeMap = Object.fromEntries(calendarTypes.map(ct => [ct.code, ct.id]));
    console.log(`✅ Calendar types: ${Object.keys(calendarTypeMap).join(', ')}`);

    // ── 2. Calc working hours per shift ──────────────────────────────────────
    const netMinPerDay       = calcNetMinutes(allShiftSegments);
    const workingHrsPerShift = parseFloat((netMinPerDay / 60 / shiftsPerDay).toFixed(2));
    console.log(`ℹ️  Net productive time: ${netMinPerDay} min/day = ${workingHrsPerShift} hrs/shift`);

    // ── 3. Calc actual manpower per line ─────────────────────────────────────
    console.log('[CALENDAR] Calculating manpower per line...');
    const lineActualMap = {};

    for (const line of lines) {
      const members = await queryInterface.sequelize.query(
        `SELECT e.id, e.position_name
         FROM s_employees e
         WHERE e.active = true AND e.deleted_at IS NULL AND e.position_name IS NOT NULL;`,
        { type: Sequelize.QueryTypes.SELECT }
      );

      const totalOperators = members.filter(m => {
        const pos = (m.position_name ?? '').toLowerCase();
        return !NON_OPERATOR_POSITIONS.some(nonOp =>
          pos.includes(nonOp.toLowerCase())
        );
      }).length;

      const stationTaktTimes = await queryInterface.sequelize.query(
        `SELECT st.id,
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

      lineActualMap[line.id] = { manpower: totalOperators, max_takt: maxTaktTime };
      console.log(`  ✓ Line ${line.line_code}: ${totalOperators} operators, max_takt=${maxTaktTime}s`);
    }

    // ── 4. Generate shift calendars untuk 2026 ───────────────────────────────
    // OPTION B: Per shift_number (1 row per shift per tanggal, bukan per segment)
    console.log('[CALENDAR] Generating shift calendars for 2026 (OPTION B - per shift_number)...');
    const shiftCalendars = [];
    const startDate = new Date('2026-01-01T00:00:00');
    const endDate   = new Date('2026-12-31T23:59:59');

    let workingDayCount = 0;
    let weekendCount    = 0;
    let holidayCount    = 0;

    for (const line of lines) {
      let d = new Date(startDate);

      while (d <= endDate) {
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dt = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dt}`;
        const isNationalHoliday = nationalHolidays2026.includes(dateStr);

        let typeCalendarId = null;
        let shiftIdToInsert = null;

        // ── Tentukan type calendar & shift_id ──────────────────────────────
        if (isWeekend) {
          typeCalendarId = calendarTypeMap['WEEKEND'];
          shiftIdToInsert = null; // No shift untuk weekend
          weekendCount++;
        } else if (isNationalHoliday) {
          typeCalendarId = calendarTypeMap['NATIONAL_HOLIDAY'];
          shiftIdToInsert = null; // No shift untuk holiday
          holidayCount++;
        } else {
          typeCalendarId = calendarTypeMap['WORKING_DAY'];
          workingDayCount++;

          // ── Untuk working day: insert per unique shift_number ────────────
          for (const shiftNum of Object.keys(shiftIdByNumber).sort()) {
            const shiftId = shiftIdByNumber[shiftNum];
            shiftCalendars.push({
              line_id:              line.id,
              shift_id:             shiftId,
              start_date:           dateStr,
              end_date:             dateStr,
              ref_type_calendar_id: typeCalendarId,
              date_event:           dateStr,
              active:               true,
              created_at:           new Date(),
              updated_at:           new Date(),
            });
          }
          d.setDate(d.getDate() + 1);
          continue;
        }

        // ── Untuk weekend & holiday: insert 1 row dengan shift_id=NULL ─────
        shiftCalendars.push({
          line_id:              line.id,
          shift_id:             shiftIdToInsert,
          start_date:           dateStr,
          end_date:             dateStr,
          ref_type_calendar_id: typeCalendarId,
          date_event:           dateStr,
          active:               true,
          created_at:           new Date(),
          updated_at:           new Date(),
        });

        d.setDate(d.getDate() + 1);
      }
    }

    if (shiftCalendars.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < shiftCalendars.length; i += batchSize) {
        const batch = shiftCalendars.slice(i, i + batchSize);
        await queryInterface.bulkInsert('s_shift_calendars', batch, {});
      }
      console.log(
        `✅ Inserted ${shiftCalendars.length} shift calendar rows\n` +
        `   Working days: ${workingDayCount} × ${shiftsPerDay} shifts = ${workingDayCount * shiftsPerDay} rows\n` +
        `   Weekends: ${weekendCount} × 1 row = ${weekendCount} rows\n` +
        `   Holidays: ${holidayCount} × 1 row = ${holidayCount} rows\n` +
        `   Lines: ${lines.length}`
      );
    }

    // ── 5. Generate line capacity params (WORKING DAYS ONLY) ─────────────────
    console.log('[CALENDAR] Generating line capacity params for 2026 (working days only)...');
    const capacityRows = [];
    const months = Array.from({ length: 12 }, (_, i) => ({ year: 2026, month: i + 1 }));

    for (const line of lines) {
      const actual = lineActualMap[line.id];
      if (!actual) {
        console.warn(`⚠️ Tidak ada actual data untuk line '${line.line_code}', skip.`);
        continue;
      }

      for (const { year, month } of months) {
        const workingDays = countWorkingDays(year, month, nationalHolidays2026);

        const existing = await queryInterface.sequelize.query(
          `SELECT id FROM s_line_capacity_params
           WHERE line_id = ${line.id} AND param_year = ${year} AND param_month = ${month}
           LIMIT 1;`,
          { type: Sequelize.QueryTypes.SELECT }
        );

        if (existing.length > 0) {
          console.log(`  ⏭️  Skip ${line.line_code} ${year}-${String(month).padStart(2, '0')} (exists).`);
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
          created_at:                      new Date(),
          updated_at:                      new Date(),
        });
      }
    }

    if (capacityRows.length > 0) {
      await queryInterface.bulkInsert('s_line_capacity_params', capacityRows, {});
      console.log(
        `✅ Inserted ${capacityRows.length} line capacity params ` +
        `(${lines.length} lines × 12 months | shifts_per_day=${shiftsPerDay}, working_hrs=${workingHrsPerShift}).`
      );
    } else {
      console.log('ℹ️  No new capacity params to insert.');
    }

    console.log('[DONE] Calendar seeder 2026 completed successfully.\n');
    console.log(`📊 Summary:\n` +
      `   - Working days: ${workingDayCount} days × ${shiftsPerDay} shifts\n` +
      `   - Weekends: ${weekendCount} days\n` +
      `   - National holidays: ${holidayCount} days\n` +
      `   - Total rows: ${shiftCalendars.length}`);
  },

  async down(queryInterface, Sequelize) {
    console.log('[DOWN] Rolling back calendar seeder 2026...');
    
    await queryInterface.sequelize.query(
      `DELETE FROM s_shift_calendars
       WHERE start_date >= '2026-01-01' AND start_date <= '2026-12-31';`
    );
    console.log('🗑️ Deleted s_shift_calendars (2026).');

    await queryInterface.sequelize.query(
      `DELETE FROM s_line_capacity_params
       WHERE param_year = 2026;`
    );
    console.log('🗑️ Deleted s_line_capacity_params (2026).');
    
    console.log('[DONE] Rollback completed.');
  },
};