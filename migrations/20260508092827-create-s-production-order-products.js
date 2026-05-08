export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_production_order_products', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      po_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_production_orders', key: 'id' },
        onDelete: 'CASCADE'
      },

      plan_detail_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_production_plan_details', key: 'id' },
        onDelete: 'RESTRICT'
      },

      sequence: { allowNull: false, defaultValue: 0, type: Sequelize.INTEGER },

      customer_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_customers', key: 'id' }
      },

      part_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_parts', key: 'id' }
      },

      line_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_lines', key: 'id' }
      },

      delivery_date: { allowNull: false, type: Sequelize.DATEONLY },

      planned_qty: { allowNull: false, type: Sequelize.INTEGER },
      scheduled_qty: { defaultValue: 0, type: Sequelize.INTEGER },
      actual_qty: { defaultValue: 0, type: Sequelize.INTEGER },

      notes: { type: Sequelize.TEXT },

      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_production_order_products');
  }
};