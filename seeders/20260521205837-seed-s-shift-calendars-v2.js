export default {
  async up(queryInterface, Sequelize) {
    // 1. Ambil data SLines yang ada
    const lines = await queryInterface.sequelize.query(
      `SELECT id FROM s_lines WHERE deleted_at IS NULL;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (lines.length === 0) {
      console.warn("⚠️ Tidak ada data s_lines, seeder dihentikan.");
      return;
    }

    // 2. Ambil data SShifts yang ada
    const shifts = await queryInterface.sequelize.query(
      `SELECT id FROM s_shifts WHERE deleted_at IS NULL AND active = true;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (shifts.length === 0) {
      console.warn("⚠️ Tidak ada data s_shifts, seeder dihentikan. Pastikan sudah ada seeder/data shift.");
      return;
    }

    // 3. Ambil ID RefTypeCalendars untuk tipe Working Day (bukan hari libur)
    const typeCalendars = await queryInterface.sequelize.query(
      `SELECT id FROM ref_type_calendars WHERE is_holiday = false AND deleted_at IS NULL LIMIT 1;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const typeCalendarId = typeCalendars.length > 0 ? typeCalendars[0].id : 1; 

    const shiftCalendars = [];
    const now = new Date();

    // Generate kalender mulai dari 1 Mei 2026 hingga 31 Juli 2026
    const startDate = new Date('2026-05-01T00:00:00');
    const endDate = new Date('2026-07-31T23:59:59');

    // Loop semua Line
    for (const line of lines) {
      // Loop semua Shift untuk tiap Line
      for (const shift of shifts) {
        
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          // Hanya jadwalkan pada Working Days (Senin - Jumat)
          // 0 = Minggu, 6 = Sabtu
          const dayOfWeek = currentDate.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            
            // Format tanggal YYYY-MM-DD
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const dateString = `${year}-${month}-${day}`;

            shiftCalendars.push({
              line_id: line.id,
              shift_id: shift.id,
              start_date: dateString,
              end_date: dateString,
              ref_type_calendar_id: typeCalendarId,
              date_event: dateString,
              active: true,
              created_at: now,
              updated_at: now,
            });
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    }

    if (shiftCalendars.length > 0) {
      // Insert secara bulk agar jauh lebih efisien
      await queryInterface.bulkInsert('s_shift_calendars', shiftCalendars, {});
      console.log(`✅ Berhasil insert ${shiftCalendars.length} data shift calendars untuk ${lines.length} lines (Mei - Juli 2026).`);
    }
  },

  async down(queryInterface, Sequelize) {
    // Menghapus data spesifik untuk bulan Mei - Juli 2026 saat di rollback
    await queryInterface.bulkDelete('s_shift_calendars', {
      start_date: {
        [Sequelize.Op.between]: ['2026-05-01', '2026-07-31']
      }
    }, {});
    console.log("🗑️ Berhasil menghapus data s_shift_calendars (Mei - Juli 2026) dari seeder.");
  }
};