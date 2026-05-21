'use strict';

export default {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('s_vehicles', 'availability_status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'Available'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('s_vehicles', 'availability_status');
  }
};
