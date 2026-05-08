export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_work_order_progresses', {
      id: { autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      wo_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_work_orders', key: 'id' },
        onDelete: 'CASCADE'
      },

      progress_time: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },

      cumulative_qty: { allowNull: false, type: Sequelize.INTEGER },
      progress_pct: { type: Sequelize.DECIMAL(5,2) },

      reported_by: { type: Sequelize.STRING(100) },

      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_work_order_progresses');
  }
};