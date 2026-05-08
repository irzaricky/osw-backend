export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_work_order_issues', {
      id: { autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      wo_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_work_orders', key: 'id' },
        onDelete: 'CASCADE'
      },

      issue_type: { allowNull: false, type: Sequelize.STRING(50) },
      issue_description: { allowNull: false, type: Sequelize.TEXT },

      downtime_start: { type: Sequelize.DATE },
      downtime_end: { type: Sequelize.DATE },
      downtime_minutes: { type: Sequelize.INTEGER },

      defect_qty: { type: Sequelize.INTEGER },
      defect_type: { type: Sequelize.STRING(100) },

      reported_by: { type: Sequelize.STRING(100) },

      reported_time: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },

      resolution: { type: Sequelize.TEXT },

      resolved_by: { type: Sequelize.STRING(100) },
      resolved_time: { type: Sequelize.DATE },

      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      deleted_at: { type: Sequelize.DATE }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_work_order_issues');
  }
};