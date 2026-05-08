/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_production_orders', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      po_number: { allowNull: false, unique: true, type: Sequelize.STRING(50) },

      plan_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_production_plans', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      production_start_date: { allowNull: false, type: Sequelize.DATEONLY },
      production_end_date: { allowNull: false, type: Sequelize.DATEONLY },

      earliest_delivery_date: { allowNull: false, type: Sequelize.DATEONLY },
      latest_delivery_date: { allowNull: false, type: Sequelize.DATEONLY },

      priority: { allowNull: false, defaultValue: 'Medium', type: Sequelize.STRING(20) },
      po_description: { type: Sequelize.TEXT },

      total_products: { allowNull: false, defaultValue: 0, type: Sequelize.INTEGER },
      total_planned_qty: { allowNull: false, defaultValue: 0, type: Sequelize.INTEGER },
      total_scheduled_qty: { allowNull: false, defaultValue: 0, type: Sequelize.INTEGER },
      total_actual_qty: { allowNull: false, defaultValue: 0, type: Sequelize.INTEGER },

      status: { allowNull: false, defaultValue: 'Draft', type: Sequelize.STRING(50) },

      notes: { type: Sequelize.TEXT },
      created_by: { type: Sequelize.STRING(100) },

      released_by: { type: Sequelize.STRING(100) },
      released_at: { type: Sequelize.DATE },

      rejected_by: { type: Sequelize.STRING(100) },
      rejected_at: { type: Sequelize.DATE },

      completed_at: { type: Sequelize.DATE },
      closed_at: { type: Sequelize.DATE },

      cancelled_by: { type: Sequelize.STRING(100) },
      cancelled_at: { type: Sequelize.DATE },

      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      deleted_at: { type: Sequelize.DATE }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_production_orders');
  }
};