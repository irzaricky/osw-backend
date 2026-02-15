'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.renameTable('s_employees', 's_users_details');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.renameTable('s_users_details', 's_employees');
  }
};
