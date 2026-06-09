export default {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     * s_line_capacity_params add column param_year and param_month
     */
    await queryInterface.addColumn('s_line_capacity_params', 'param_year', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: new Date().getFullYear(),
    });

    await queryInterface.addColumn('s_line_capacity_params', 'param_month', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: new Date().getMonth() + 1,
    });

    // delete unique index on line_id
    await queryInterface.removeConstraint('s_line_capacity_params', 'uniq_line_capacity_param');

    // unique index on line_id + param_year + param_month
    await queryInterface.addConstraint('s_line_capacity_params', {
      fields: ['line_id', 'param_year', 'param_month'],
      type: 'unique',
      name: 'unique_line_year_month',
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeConstraint('s_line_capacity_params', 'unique_line_year_month');
    await queryInterface.addConstraint('s_line_capacity_params', {
      fields: ['line_id'],
      type: 'unique',
      name: 'uniq_line_capacity_param',
    });
    await queryInterface.removeColumn('s_line_capacity_params', 'param_year');
    await queryInterface.removeColumn('s_line_capacity_params', 'param_month');
  }
};
