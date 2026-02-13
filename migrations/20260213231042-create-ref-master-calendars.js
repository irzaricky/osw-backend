/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ref_master_calendars', {
      date: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.DATEONLY
      },
      year: {
        allowNull: false,
        type: Sequelize.INTEGER
      },
      month: {
        allowNull: false,
        type: Sequelize.INTEGER
      },
      day: {
        allowNull: false,
        type: Sequelize.INTEGER
      },
      is_holiday: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_weekend: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      description: {
        allowNull: true,
        type: Sequelize.STRING(150)
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('ref_master_calendars');
  }
};
