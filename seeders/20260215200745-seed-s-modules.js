'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const modules = [
      { name: 'Master Data', code: 'master-data', icon: 'mdi-database', sequence: 1, created_at: new Date(), updated_at: new Date() },
      { name: 'Sales', code: 'sales', icon: 'mdi-cart', sequence: 2, created_at: new Date(), updated_at: new Date() },
      { name: 'Warehouse', code: 'warehouse', icon: 'mdi-warehouse', sequence: 3, created_at: new Date(), updated_at: new Date() },
      { name: 'Production', code: 'production', icon: 'mdi-factory', sequence: 4, created_at: new Date(), updated_at: new Date() },
    ];

    for (const module of modules) {
      const exists = await queryInterface.rawSelect('s_modules', {
        where: { code: module.code },
      }, ['id']);

      if (!exists) {
        await queryInterface.bulkInsert('s_modules', [module]);
      }
    }
  },

  async down(queryInterface, Sequelize) {
     await queryInterface.bulkDelete('s_modules', null, {});
  }
};
