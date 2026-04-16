export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_production_plan_adjustments', {
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

      adjustment_type: { type: Sequelize.STRING(50), allowNull: false },
      adjustment_description: Sequelize.TEXT,
      sequence: { type: Sequelize.INTEGER, defaultValue: 0 },

      base_value: { type: Sequelize.DECIMAL(10,2), allowNull: false },
      adjusted_value: { type: Sequelize.DECIMAL(10,2), allowNull: false },
      difference: Sequelize.DECIMAL(10,2),

      capacity_impact_minutes: Sequelize.DECIMAL(15,2),

      created_by: Sequelize.STRING(100),

      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      deleted_at: Sequelize.DATE
    });

    await queryInterface.addConstraint('s_production_plan_adjustments', {
      fields: ['plan_header_id', 'line_id', 'sequence'],
      type: 'unique',
      name: 'uniq_adjustment_sequence'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_production_plan_adjustments');
  }
};