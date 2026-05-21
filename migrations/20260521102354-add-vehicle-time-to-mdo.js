'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_material_delivery_orders', 'vehicle_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 's_vehicles', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'dock_id', // MySQL; Postgres mengabaikan ini
    });

    await queryInterface.addColumn('s_material_delivery_orders', 'target_time', {
      type: Sequelize.TIME,
      allowNull: true,
      comment: 'Slot jam bongkar di dock, format HH:MM',
      after: 'target_date',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('s_material_delivery_orders', 'vehicle_id');
    await queryInterface.removeColumn('s_material_delivery_orders', 'target_time');
  },
};