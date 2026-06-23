export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_production_plan_capacity_results', {
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

      total_stations: { type: Sequelize.INTEGER, allowNull: false },
      total_jobs: { type: Sequelize.INTEGER, allowNull: false },
      max_takt_time: Sequelize.INTEGER,

      capacity_per_hour: Sequelize.DECIMAL(10,2),
      total_capacity_minutes: { type: Sequelize.DECIMAL(15,2), allowNull: false },
      total_required_minutes: { type: Sequelize.DECIMAL(15,2), allowNull: false },

      capacity_gap_minutes: Sequelize.DECIMAL(15,2),
      utilization_pct: Sequelize.DECIMAL(10,2),

      status: { type: Sequelize.STRING(50), allowNull: false },

      calculated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      calculation_version: { type: Sequelize.INTEGER, defaultValue: 1 }
    });

    await queryInterface.addConstraint('s_production_plan_capacity_results', {
      fields: ['plan_id', 'line_id'],
      type: 'unique',
      name: 'uniq_capacity_result'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_production_plan_capacity_results');
  }
};