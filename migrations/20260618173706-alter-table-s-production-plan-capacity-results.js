'use strict';

export default {
  async up(queryInterface, Sequelize) {
    // Hapus kolom yang tidak dibutuhkan
    await queryInterface.removeColumn('s_production_plan_capacity_results', 'total_capacity_minutes');
    await queryInterface.removeColumn('s_production_plan_capacity_results', 'total_required_minutes');
    // s_production_order_schedules ADD COLUMN regular_cap_snapshot INTEGER NULL;
    await queryInterface.addColumn('s_production_order_schedules', 'regular_cap_snapshot', {
      type:         Sequelize.INTEGER,
      allowNull:    true,
    });

    // Rename capacity_gap_minutes → capacity_gap_units
    await queryInterface.renameColumn(
      's_production_plan_capacity_results',
      'capacity_gap_minutes',
      'capacity_gap_units'
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_production_plan_capacity_results', 'total_capacity_minutes', {
      type:         Sequelize.DECIMAL(12, 2),
      allowNull:    true,
    });
    await queryInterface.addColumn('s_production_plan_capacity_results', 'total_required_minutes', {
      type:         Sequelize.DECIMAL(12, 2),
      allowNull:    true,
    });
    await queryInterface.renameColumn(
      's_production_plan_capacity_results',
      'capacity_gap_units',
      'capacity_gap_minutes'
    );

    await queryInterface.removeColumn('s_production_order_schedules', 'regular_cap_snapshot');
  },
};