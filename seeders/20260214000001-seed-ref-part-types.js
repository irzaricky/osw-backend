/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const types = [
      { code: 'PRODUCT', name: 'Finished Good' },
      { code: 'WIP', name: 'Work In Progress (Sub-Assembly)' },
      { code: 'RAW', name: 'Raw Material' }
    ];

    for (const type of types) {
      const exists = await queryInterface.rawSelect('ref_part_types', {
        where: { code: type.code },
      }, ['id']);

      if (!exists) {
        await queryInterface.bulkInsert('ref_part_types', [{
          ...type,
          created_at: new Date(),
          updated_at: new Date()
        }]);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('ref_part_types', null, {});
  }
};
