export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    // Helper to find Line ID
    const getLineId = async (name) => {
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_lines WHERE name = '${name}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return result[0]?.id;
    };

    // Helper to find Shift ID (by name or other unique prop, but user gave names like 'Shift 1', 'Shift 1 Overtime')
    // Shift names in DB: 'Shift 1', 'Shift 2', 'Shift 3', 'Shift 1 Overtime', etc.
    // User data uses these names directly.
    const getShiftId = async (description) => {
       // Ideally we match by name or description.
       // Seeder for shifts used "description" as the unique identifier like 'Shift Pagi', 'Shift Pagi Lanjutan'.
       // But user input in this request uses "SHIFT NAME" like "Shift 1", "Shift 1 Overtime".
       // In my `s_shifts` table, I have `name` ('Shift 1') and `description` ('Shift Pagi').
       // And `shift_number`.
       // "Shift 1" -> `name`='Shift 1' AND `type`='REGULAR'?
       // "Shift 1 Overtime" -> `name`='Shift 1 Overtime' (This is what I ceded for 'Shift 1 Overtime')
       // Let's match by `name`. 
       // Note: 'Shift 1' exists 3 times (Pagi, ISHOMA, Pagi Lanjutan).
       // The user input doesn't specify which "part" of Shift 1.
       // "Line Assembly Frame	Shift 1	... Normal Production".
       // Typically a "Production Schedule" applies to the *Working* shift.
       // I should probably pick the `PRODUCTIVE` ones.
       
       // Strategy: Find all shifts with `name` = 'Shift 1' and `category` = 'PRODUCTIVE'.
       // But wait, there are 2 productive blocks for Shift 1 (Pagi + Pagi Lanjutan).
       // Should we schedule for EACH productive block? Or just link to the "Main" shift concept?
       // The `s_production_schedules` table links to a `shift_id` (FK to `s_shifts` PK).
       // If I link to just ONE of them, queries might miss the other.
       // If I link to ALL of them, I get multiple rows per day.
       
       // Example data: "Shift 1 ... Normal Production".
       // Best approach: Find ALL `id`s for `name`='Shift 1'.
       // BUT, "Shift 1 Overtime" is a separate name in my seeder: 'Shift 1 Overtime'.
       
       const shifts = await queryInterface.sequelize.query(
          `SELECT id, name, type, category FROM s_shifts WHERE name = '${description}'`,
          { type: queryInterface.sequelize.QueryTypes.SELECT }
       );
       return shifts; // returns array of shift objects
    };

    const scheduleData = [
      { line: 'Line Assembly Frame', shift: 'Shift 1', start: '2026-01-05', end: '2026-01-09', cat: 'WEEKDAY', event: 'Normal Production' },
      { line: 'Line Assembly Electrical', shift: 'Shift 2', start: '2026-01-05', end: '2026-01-09', cat: 'WEEKDAY', event: 'Normal Production' },
      { line: 'Line Assembly Electrical', shift: 'Shift 3', start: '2026-01-05', end: '2026-01-09', cat: 'WEEKDAY', event: 'Night Production' },
      { line: 'Line Assembly Frame', shift: 'Shift 1 Overtime', start: '2026-01-10', end: '2026-01-11', cat: 'WEEKEND', event: 'Overtime Production' },
      { line: 'Line Assembly Electrical', shift: 'Shift 2 Overtime', start: '2026-01-10', end: '2026-01-11', cat: 'WEEKEND', event: 'Overtime Production' },
      { line: 'Line Assembly Electrical', shift: 'Shift 3 Overtime', start: '2026-01-10', end: '2026-01-11', cat: 'WEEKEND', event: 'Overtime Night' }
    ];

    const records = [];
    for (const item of scheduleData) {
      const lineId = await getLineId(item.line);
      const shiftObjs = await getShiftId(item.shift);

      if (lineId && shiftObjs.length > 0) {
        // Expand for each matching PRODUCTIVE shift (ignore BREAKs)
        for (const shift of shiftObjs) {
           if (shift.category === 'PRODUCTIVE') {
             records.push({
               line_id: lineId,
               shift_id: shift.id,
               start_date: item.start,
               end_date: item.end,
               date_category: item.cat,
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
