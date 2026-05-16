export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    const status = [
      { id: 1, name: 'Arrived', ...timestamp },
      { id: 2, name: 'Quantity Checking', ...timestamp },
      { id: 3, name: 'Quality Checking', ...timestamp },
      { id: 4, name: 'Waiting GR Approval', ...timestamp },
      { id: 5, name: 'Good Receipt', ...timestamp },
    ];
    await queryInterface.bulkInsert('ref_receiving_status', status, { ignoreDuplicates: true });

    if (queryInterface.sequelize.options.dialect === 'postgres') {
      await queryInterface.sequelize.query("SELECT setval('ref_receiving_status_id_seq', (SELECT MAX(id) FROM ref_receiving_status));");
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('ref_receiving_status', null, {});
  }
};