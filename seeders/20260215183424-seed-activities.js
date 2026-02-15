'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    await queryInterface.bulkInsert('ref_activities', [
      { name: 'Login', code: 'LOGIN', created_at: new Date(), updated_at: new Date() },
      { name: 'Logout', code: 'LOGOUT', created_at: new Date(), updated_at: new Date() },
      { name: 'Create', code: 'CREATE', created_at: new Date(), updated_at: new Date() },
      { name: 'Update', code: 'UPDATE', created_at: new Date(), updated_at: new Date() },
      { name: 'Delete', code: 'DELETE', created_at: new Date(), updated_at: new Date() },
      { name: 'Update Status', code: 'UPDATE_STATUS', created_at: new Date(), updated_at: new Date() },
      { name: 'Export', code: 'EXPORT', created_at: new Date(), updated_at: new Date() },
      { name: 'Import', code: 'IMPORT', created_at: new Date(), updated_at: new Date() }
    ]);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('ref_activities', null, {});
  }
};
