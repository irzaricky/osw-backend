/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_production_plans', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      plan_number: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      plan_description: Sequelize.TEXT,

      earliest_delivery_date: Sequelize.DATEONLY,
      latest_delivery_date: Sequelize.DATEONLY,

      total_products: { type: Sequelize.INTEGER, defaultValue: 0 },
      total_qty_request: { type: Sequelize.INTEGER, defaultValue: 0 },
      total_qty_capacity: { type: Sequelize.INTEGER, defaultValue: 0 },

      overall_status: { type: Sequelize.STRING(50), defaultValue: 'Not_Calculated' },
      status: { type: Sequelize.STRING(50), defaultValue: 'Draft' },

      notes: Sequelize.TEXT,
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_users',
          key: 'id'
        },
      },

      approved_by: {
        type: Sequelize.INTEGER,
        references: {
          model: 's_users',
          key: 'id'
        },
      },
      approved_at: Sequelize.DATE,
      approval_notes: Sequelize.TEXT,

      rejected_by: {
        type: Sequelize.INTEGER,
        references: {
          model: 's_users',
          key: 'id'
        },
      },
      rejected_at: Sequelize.DATE,
      rejection_reason: Sequelize.TEXT,

      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      deleted_at: Sequelize.DATE
    });

    await queryInterface.addIndex('s_production_plans', ['status']);
    await queryInterface.addIndex('s_production_plans', ['overall_status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_production_plans');
  }
};