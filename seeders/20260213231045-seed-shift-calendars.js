export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    // Fetch the inserted type calendars
    const [types] = await queryInterface.sequelize.query(
      `SELECT id, code FROM ref_type_calendars;`
    );

    const typeMap = {};
    for (const type of types) {
      typeMap[type.code] = type.id;
    }

    const workingDayId = typeMap['WORKING_DAY'];
    const weekendId = typeMap['WEEKEND'];

    if (!workingDayId || !weekendId) {
       console.log('Calendar types not found. Skipping shift calendars seeder.');
       return;
    }

    // Helper to find Line ID
    const getLineId = async (name) => {
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_lines WHERE name = '${name}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return result[0]?.id;
    };

    const getShiftId = async (description) => {
       const shifts = await queryInterface.sequelize.query(
          `SELECT id, name, type, category FROM s_shifts WHERE name = '${description}'`,
          { type: queryInterface.sequelize.QueryTypes.SELECT }
       );
       return shifts; 
    };

    const scheduleData = [
      { line: 'Line Assembly Frame', shift: 'Shift 1', start: '2026-01-05', end: '2026-01-09', type_id: workingDayId, event: 'Normal Production' },
      { line: 'Line Assembly Electrical', shift: 'Shift 2', start: '2026-01-05', end: '2026-01-09', type_id: workingDayId, event: 'Normal Production' },
      { line: 'Line Assembly Electrical', shift: 'Shift 3', start: '2026-01-05', end: '2026-01-09', type_id: workingDayId, event: 'Night Production' },
      { line: 'Line Assembly Frame', shift: 'Shift 1 Overtime', start: '2026-01-10', end: '2026-01-11', type_id: weekendId, event: 'Overtime Production' },
      { line: 'Line Assembly Electrical', shift: 'Shift 2 Overtime', start: '2026-01-10', end: '2026-01-11', type_id: weekendId, event: 'Overtime Production' },
      { line: 'Line Assembly Electrical', shift: 'Shift 3 Overtime', start: '2026-01-10', end: '2026-01-11', type_id: weekendId, event: 'Overtime Night' }
    ];

    const records = [];
    for (const item of scheduleData) {
      const lineId = await getLineId(item.line);
      const shiftObjs = await getShiftId(item.shift);

      if (lineId && shiftObjs.length > 0) {
        for (const shift of shiftObjs) {
           if (shift.category === 'PRODUCTIVE') {
             records.push({
               line_id: lineId,
               shift_id: shift.id,
               start_date: item.start,
               end_date: item.end,
               ref_type_calendar_id: item.type_id,
               date_event: item.event,
               active: true,
               ...timestamp
             });
           }
        }
      } else {
        console.warn(`Skipping schedule: Line '${item.line}' or Shift '${item.shift}' not found.`);
      }
    }

    if (records.length > 0) {
      await queryInterface.bulkInsert('s_shift_calendars', records, { ignoreDuplicates: true });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_shift_calendars', null, {});
  }
};
