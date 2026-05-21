'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('s_material_purchase_orders', 'mpr_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.changeColumn('s_material_purchase_orders', 'mrp_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('s_material_purchase_orders', 'mpr_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    await queryInterface.changeColumn('s_material_purchase_orders', 'mrp_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};