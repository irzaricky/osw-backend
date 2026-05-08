export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_production_plan_capacity_params', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      plan_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_production_plans', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },

      line_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_lines', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      },

      param_type: { type: Sequelize.STRING(20), allowNull: false },

      working_days: { type: Sequelize.INTEGER, allowNull: false },
      shifts_per_day: { type: Sequelize.INTEGER, defaultValue: 1 },
      working_hours_per_shift: { type: Sequelize.DECIMAL(5,2), allowNull: false },
      manpower: { type: Sequelize.INTEGER, allowNull: false },
      efficiency_factor: { type: Sequelize.DECIMAL(5,4), defaultValue: 0.85 },
      overtime_hours: { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },

      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    await queryInterface.addConstraint('s_production_plan_capacity_params', {
      fields: ['plan_id', 'line_id', 'param_type'],
      type: 'unique',
      name: 'uniq_capacity_param'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_production_plan_capacity_params');
  }
};