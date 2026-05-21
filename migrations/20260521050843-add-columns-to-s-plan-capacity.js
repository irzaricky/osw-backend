export default {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('s_production_plan_capacity_results', 'total_capacity_units', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('s_production_plans', 'bottleneck_line_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_lines',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    }); 
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('s_production_plan_capacity_results', 'total_capacity_units');
    await queryInterface.removeColumn('s_production_plans', 'bottleneck_line_id');
  }
};
