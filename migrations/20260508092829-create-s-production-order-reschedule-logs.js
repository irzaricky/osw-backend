export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_production_order_reschedule_logs', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      po_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_production_orders', key: 'id' },
        onDelete: 'CASCADE'
      },

      old_start_date: { allowNull: false, type: Sequelize.DATEONLY },
      old_end_date: { allowNull: false, type: Sequelize.DATEONLY },
      new_start_date: { allowNull: false, type: Sequelize.DATEONLY },
      new_end_date: { allowNull: false, type: Sequelize.DATEONLY },

      reschedule_reason: { allowNull: false, type: Sequelize.TEXT },

      impacted_wo_count: { type: Sequelize.INTEGER },

      rescheduled_by: { type: Sequelize.INTEGER, references: { model: 's_users', key: 'id' } },

      rescheduled_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_production_order_reschedule_logs');
  }
};