export default {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     * SProductionPlanDetailLine,   // NEW: pivot table (plan_detail_id, line_id, sequence, qty_capacity, capacity_gap, status)
     */
    await queryInterface.createTable('s_production_plan_detail_lines', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      plan_detail_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_production_plan_details',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      line_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_lines',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      qty_capacity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      capacity_gap: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Not_Calculated'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE
      }
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.dropTable('s_production_plan_detail_lines');
  }
};
