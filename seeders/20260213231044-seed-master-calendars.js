export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };
    const year = 2026;
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);

    const records = [];
    const currentDate = new Date(startDate);

    // Sample Holidays (Indonesia 2026 - Approximate/Example)
    const holidays = {
      '2026-01-01': 'New Year 2026',
      '2026-02-17': 'Chinese New Year 2577',
      '2026-03-20': 'Hari Raya Idul Fitri 1447H', // Example date
      '2026-03-21': 'Hari Raya Idul Fitri 1447H', // Example date
      '2026-05-01': 'Labor Day',
      '2026-08-17': 'Independence Day',
      '2026-12-25': 'Christmas Day'
    };

    while (currentDate <= endDate) {
      const yearStr = currentDate.getFullYear();
      const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dayStr = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${yearStr}-${monthStr}-${dayStr}`;

      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const holidayDesc = holidays[dateStr];
      const isHoliday = !!holidayDesc;

      records.push({
        date: dateStr,
        year: parseInt(yearStr),
        month: parseInt(monthStr),
        day: parseInt(dayStr),
        is_holiday: isHoliday,
        is_weekend: isWeekend,
        description: holidayDesc || null,
        ...timestamp
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    await queryInterface.bulkInsert('ref_master_calendars', records, { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('ref_master_calendars', null, {});
  }
};
