export default {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     * 
     */
    await queryInterface.addColumn('s_production_plan_details', 'routing_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    await queryInterface.addColumn('s_production_plan_details', 'assigned_line_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    await queryInterface.addColumn('s_production_plan_details', 'required_minutes', {
      type: Sequelize.DECIMAL(15, 2),
      defaultValue: 0
    });

    await queryInterface.addColumn('s_production_plan_details', 'priority_level', {
      type: Sequelize.STRING(20)
    });

    await queryInterface.addColumn('s_production_plan_details', 'priority_score', {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 0
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('s_production_plan_details', 'routing_id');
    await queryInterface.removeColumn('s_production_plan_details', 'assigned_line_id');
    await queryInterface.removeColumn('s_production_plan_details', 'required_minutes');
    await queryInterface.removeColumn('s_production_plan_details', 'priority_level');
    await queryInterface.removeColumn('s_production_plan_details', 'priority_score');
  }
};
