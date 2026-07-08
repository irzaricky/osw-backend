'use strict';

export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn('s_material_purchase_request_logs', 'user_id', {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: { model: 's_users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  });

  await queryInterface.addColumn('s_material_purchase_request_logs', 'status', {
    type: Sequelize.STRING,
    allowNull: true
  });

  await queryInterface.addColumn('s_material_purchase_request_logs', 'remarks', {
    type: Sequelize.TEXT,
    allowNull: true
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('s_material_purchase_request_logs', 'user_id');
  await queryInterface.removeColumn('s_material_purchase_request_logs', 'status');
  await queryInterface.removeColumn('s_material_purchase_request_logs', 'remarks');
}