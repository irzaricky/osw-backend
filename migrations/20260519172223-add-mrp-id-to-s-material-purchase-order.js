'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_material_purchase_orders', 'mrp_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'mpr_id',
      references: { model: 's_mrps', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('s_material_purchase_orders', 'mrp_id');
  }
};