'use strict';

export default {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('ref_vehicle_types', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('ref_vehicle_types', 'deleted_at');
  }
};
