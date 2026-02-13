export default {
  async up(queryInterface, Sequelize) {
    // 1. Seed Divisions
    await queryInterface.bulkInsert('ref_divisions', [
      { id: 1, name: 'SALES', created_at: new Date(), updated_at: new Date() },
      { id: 2, name: 'WAREHOUSE', created_at: new Date(), updated_at: new Date() },
      { id: 3, name: 'PPIC', created_at: new Date(), updated_at: new Date() },
      { id: 4, name: 'PURCHASING', created_at: new Date(), updated_at: new Date() }
    ]);

    // 2. Seed Roles
    const rolesData = [
      { name: 'Superadmin', division_id: null },
      { name: 'Staff Sales Forecast', division_id: 1 },
      { name: 'Supervisor Sales Forecast', division_id: 1 },
      { name: 'Staff Sales Order', division_id: 1 },
      { name: 'Supervisor Sales Order', division_id: 1 },
      { name: 'Staff Sales Delivery', division_id: 1 },
      { name: 'Supervisor Sales Delivery', division_id: 1 },
      { name: 'Admin sales', division_id: 1 },
      { name: 'Warehouse Staff', division_id: 2 },
      { name: 'Supervisor Warehouse', division_id: 2 },
      { name: 'Admin Warehouse', division_id: 2 },
      { name: 'Admin PPIC', division_id: 3 },
      { name: 'Staff PPIC', division_id: 3 },
      { name: 'Supervisor PPIC', division_id: 3 },
      { name: 'Admin Production', division_id: 4 },
      { name: 'Purchasing Manager', division_id: 4 },
      { name: 'Driver', division_id: null }
    ].map(role => ({
      ...role,
      status: true,
      created_at: new Date(),
      updated_at: new Date()
    }));

    await queryInterface.bulkInsert('s_roles', rolesData, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_roles', null, {});
    await queryInterface.bulkDelete('ref_divisions', null, {});
  }
};