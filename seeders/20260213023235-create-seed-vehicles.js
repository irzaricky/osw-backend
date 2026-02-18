'use strict';

/** @type {import('sequelize-cli').Migration} */
export default{
  async up(queryInterface, Sequelize) {
    // 1. Seed Reference Types
    await queryInterface.bulkInsert('ref_vehicle_types', [
      { id: 1, name: 'TRUCK CDE', load_capacity: 50, created_at: new Date(), updated_at: new Date() },
      { id: 2, name: 'TRUCK CDD', load_capacity: 60, created_at: new Date(), updated_at: new Date() },
      { id: 3, name: 'WINGBOX 80', load_capacity: 80, created_at: new Date(), updated_at: new Date() },
      { id: 4, name: 'WINGBOX 100', load_capacity: 100, created_at: new Date(), updated_at: new Date() }
    ]);

    // 2. Seed Static Vehicles
    await queryInterface.bulkInsert('s_vehicles', [
      {
        vehicle_code: 'VH-001',
        plate_number: 'AD 8821 ZA',
        vehicle_type_id: 1, // TRUCK CDE 50
        image: null,
        status: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        vehicle_code: 'VH-002',
        plate_number: 'AD 9102 BB',
        vehicle_type_id: 1, // TRUCK CDE 50
        image: null,
        status: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        vehicle_code: 'VH-003',
        plate_number: 'AD 9231 SQU',
        vehicle_type_id: 2, // TRUCK CDD 60
        image: null,
        status: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        vehicle_code: 'VH-004',
        plate_number: 'AD 1102 WY',
        vehicle_type_id: 3, // WINGBOX 80
        image: null,
        status: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        vehicle_code: 'VH-005',
        plate_number: 'AD 8088 AN',
        vehicle_type_id: 4, // WINGBOX 100
        image: null,
        status: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_vehicles', null, {});
    await queryInterface.bulkDelete('ref_vehicle_types', null, {});
  }
};