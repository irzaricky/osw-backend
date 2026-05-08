export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_work_order_stations', {
      id: { autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      wo_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_work_orders', key: 'id' },
        onDelete: 'CASCADE'
      },

      station_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_stations', key: 'id' }
      },

      sequence: { allowNull: false, type: Sequelize.INTEGER },

      planned_quantity: { allowNull: false, type: Sequelize.INTEGER },
      actual_quantity: { defaultValue: 0, type: Sequelize.INTEGER },

      status: { allowNull: false, defaultValue: 'Pending', type: Sequelize.STRING(50) },

      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_work_order_stations');
  }
};