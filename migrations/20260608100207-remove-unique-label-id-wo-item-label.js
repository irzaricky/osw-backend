'use strict';

export async function up(queryInterface, Sequelize) {
  await queryInterface.removeConstraint(
    't_work_order_storing_item_label',
    'uq_work_order_storing_item_label_label_id'
  );
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.addConstraint(
    't_work_order_storing_item_label',
    {
      fields: ['label_id'],
      type: 'unique',
      name: 'uq_work_order_storing_item_label_label_id'
    }
  );
}