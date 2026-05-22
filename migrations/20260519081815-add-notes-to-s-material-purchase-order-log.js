'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_material_purchase_order_logs', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'action'
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('s_material_purchase_order_logs', 'notes');
  }
};