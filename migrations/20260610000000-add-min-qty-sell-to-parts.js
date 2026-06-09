'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_parts', 'min_qty_sell', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 10,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('s_parts', 'min_qty_sell');
  }
};
