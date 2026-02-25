/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_shift_calendars', null, {});
    await queryInterface.removeColumn('s_shift_calendars', 'date_category');

    // Add ref_type_calendar_id
    await queryInterface.addColumn('s_shift_calendars', 'ref_type_calendar_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'ref_type_calendars',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
  },
  
  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_shift_calendars', null, {});
    
    await queryInterface.removeColumn('s_shift_calendars', 'ref_type_calendar_id');

    await queryInterface.addColumn('s_shift_calendars', 'date_category', {
      allowNull: false,
      type: Sequelize.STRING(50) // WEEKDAY, WEEKEND
    });
  }
};
