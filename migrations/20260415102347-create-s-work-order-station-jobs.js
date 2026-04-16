export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_work_order_station_jobs', {
      id: { autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      wo_station_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_work_order_stations', key: 'id' },
        onDelete: 'CASCADE'
      },

      station_job_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_station_jobs', key: 'id' }
      },

      job_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_jobs', key: 'id' }
      },

      sequence: { allowNull: false, type: Sequelize.INTEGER },

      standard_time: { allowNull: false, type: Sequelize.INTEGER },
      actual_time: { type: Sequelize.INTEGER },

      status: { allowNull: false, defaultValue: 'Pending', type: Sequelize.STRING(50) },

      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_work_order_station_jobs');
  }
};