'use strict';

export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn('s_material_purchase_order_logs', 'user_id', {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: { model: 's_users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  });

  await queryInterface.addColumn('s_material_purchase_order_logs', 'status', {
    type: Sequelize.STRING,
    allowNull: true
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('s_material_purchase_order_logs', 'user_id');
  await queryInterface.removeColumn('s_material_purchase_order_logs', 'status');
}