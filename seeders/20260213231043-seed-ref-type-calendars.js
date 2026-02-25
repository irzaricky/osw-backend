export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };
    
    const types = [
      {
        code: 'WEEKEND',
        name: 'Weekend',
        is_holiday: true,
        description: 'Regular weekend days (Saturday/Sunday)',
        ...timestamp
      },
      {
        code: 'WORKING_DAY',
        name: 'Working Day',
        is_holiday: false,
        description: 'Regular working days',
        ...timestamp
      },
      {
        code: 'NATIONAL_HOLIDAY',
        name: 'National Holiday',
        is_holiday: true,
        description: 'Public and national holidays',
        ...timestamp
      },
      {
        code: 'COMPANY_EVENT',
        name: 'Company Event',
        is_holiday: true,
        description: 'Special company events',
        ...timestamp
      }
    ];

    await queryInterface.bulkInsert('ref_type_calendars', types, { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('ref_type_calendars', null, {});
  }
};
