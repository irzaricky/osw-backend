export default {
  async up (queryInterface, Sequelize) {
    /**
     * Add seed commands here.
     *
     * Example:
     * await queryInterface.bulkInsert('People', [{
     *   name: 'John Doe',
     *   isBetaMember: false
     * }], {});
    */

    // Seed common UoMs
    await queryInterface.bulkInsert('s_uoms', [
      { code: 'PCS',  name: 'Pieces', is_active: true, created_at: new Date(), updated_at: new Date() },
      { code: 'SET',  name: 'Set', is_active: true, created_at: new Date(), updated_at: new Date() },
      { code: 'KG',   name: 'Kilogram', is_active: true, created_at: new Date(), updated_at: new Date() },
      { code: 'G',    name: 'Gram', is_active: true, created_at: new Date(), updated_at: new Date() },
      { code: 'LTR',  name: 'Liter', is_active: true, created_at: new Date(), updated_at: new Date() },
      { code: 'ML',   name: 'Mililiter', is_active: true, created_at: new Date(), updated_at: new Date() },
      { code: 'M',    name: 'Meter', is_active: true, created_at: new Date(), updated_at: new Date() },
      { code: 'CM',   name: 'Centimeter', is_active: true, created_at: new Date(), updated_at: new Date() },
      { code: 'M2',   name: 'Meter Persegi', is_active: true, created_at: new Date(), updated_at: new Date() },
      { code: 'BOX',  name: 'Box', is_active: true, created_at: new Date(), updated_at: new Date() },
      { code: 'ROLL', name: 'Roll', is_active: true, created_at: new Date(), updated_at: new Date() }
    ]);
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add commands to revert seed here.
     *
     * Example:
     * await queryInterface.bulkDelete('People', null, {});
     */
    await queryInterface.bulkDelete('s_uoms', {
      code: ['PCS', 'SET', 'KG', 'G', 'LTR', 'ML', 'M', 'CM', 'M2', 'BOX', 'ROLL']
    }, {});
  }
};
