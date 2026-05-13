'use strict';

export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn(
    't_warehouse_stock_log',
    'old_data',
    {
      type: Sequelize.JSONB,
      allowNull: true
    }
  );
}

export async function down(queryInterface) {
  await queryInterface.removeColumn(
    't_warehouse_stock_log',
    'old_data'
  );
}