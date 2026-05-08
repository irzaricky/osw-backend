export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_production_order_schedules', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      po_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_production_orders', key: 'id' },
        onDelete: 'CASCADE'
      },

      po_product_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_production_order_products', key: 'id' },
        onDelete: 'CASCADE'
      },

      sequence: { allowNull: false, defaultValue: 0, type: Sequelize.INTEGER },

      production_date: { allowNull: false, type: Sequelize.DATEONLY },

      line_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_lines', key: 'id' }
      },

      shift_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_shifts', key: 'id' }
      },

      part_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_parts', key: 'id' }
      },

      planned_qty_per_day: { allowNull: false, type: Sequelize.INTEGER },
      actual_qty_per_day: { defaultValue: 0, type: Sequelize.INTEGER },

      line_capacity_per_day: { type: Sequelize.INTEGER },
      utilization_pct: { type: Sequelize.DECIMAL(5,2) },

      status: { allowNull: false, defaultValue: 'Scheduled', type: Sequelize.STRING(50) },

      notes: { type: Sequelize.TEXT },

      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_production_order_schedules');
  }
};