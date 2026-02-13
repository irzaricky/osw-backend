export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    // 1. Seed Factories
    await queryInterface.bulkInsert('s_factories', [
      { id: 1, name: 'Factory Assy', address: 'Jogja', phone: '129893', maps_url: 'https://maps.google.com', ...timestamp },
      { id: 2, name: 'Factory Warehouse', address: 'Klaten', phone: '27189', maps_url: 'https://maps.google.com', ...timestamp },
      { id: 3, name: 'Factory Painting', address: 'Wonogiri', phone: '21789', maps_url: 'https://maps.google.com', ...timestamp }
    ]);

    // 2. Seed Lines
    await queryInterface.bulkInsert('s_lines', [
      { id: 1, line_code: 'ASSY-FRM', name: 'Line Assembly Frame', factory_id: 1, sequence: 10, ...timestamp },
      { id: 2, line_code: 'ASSY-BATT', name: 'Line Battery Assembly', factory_id: 1, sequence: 20, ...timestamp },
      { id: 3, line_code: 'ASSY-ELEC', name: 'Line Assembly Electrical', factory_id: 1, sequence: 30, ...timestamp },
      { id: 4, line_code: 'ASSY-FNL', name: 'Line Assembly Final', factory_id: 1, sequence: 40, ...timestamp },
      { id: 5, line_code: 'ASSY-TEST', name: 'Line Charging & Testing', factory_id: 1, sequence: 50, ...timestamp },
      { id: 6, line_code: 'ASSY-QC', name: 'Line QC Final', factory_id: 1, sequence: 60, ...timestamp },
      { id: 7, line_code: 'ASSY-RWK', name: 'Line Rework', factory_id: 1, sequence: 70, ...timestamp },
      { id: 8, line_code: 'PAINT-PRM', name: 'Line Painting Primer', factory_id: 3, sequence: 80, ...timestamp },
      { id: 9, line_code: 'PAINT-COL', name: 'Line Painting Color', factory_id: 3, sequence: 90, ...timestamp },
      { id: 10, line_code: 'PAINT-COAT', name: 'Line Painting Color Coat', factory_id: 3, sequence: 100, ...timestamp },
      { id: 11, line_code: 'WH-INQC', name: 'Line Incoming QC', factory_id: 2, sequence: 5, ...timestamp },
      { id: 12, line_code: 'WH-MAT', name: 'Line Material Handling', factory_id: 2, sequence: 15, ...timestamp },
      { id: 13, line_code: 'WH-PACK', name: 'Line Packing', factory_id: 2, sequence: 110, ...timestamp },
      { id: 14, line_code: 'WH-FG', name: 'Line Finished Goods Storage', factory_id: 2, sequence: 120, ...timestamp }
    ]);

    // 3. Seed Reference Station Types
    await queryInterface.bulkInsert('ref_station_types', [
      { id: 1, name: 'INSPECTION', ...timestamp },
      { id: 2, name: 'ASSEMBLY', ...timestamp },
      { id: 3, name: 'TESTING', ...timestamp },
      { id: 4, name: 'PAINTING', ...timestamp },
      { id: 5, name: 'OVEN', ...timestamp },
      { id: 6, name: 'PACKING', ...timestamp }
    ]);

    // 4. Seed Stations
    const stations = [
      // Line Assembly Frame
      { station_code: 'ST-FRM-INSP', name: 'Incoming Frame Inspection', line_id: 1, station_type_id: 1, sequence: 10, status: true },
      { station_code: 'ST-FRM-WELD', name: 'Frame Welding Check', line_id: 1, station_type_id: 1, sequence: 20, status: true },
      { station_code: 'ST-FRM-ALIGN', name: 'Frame Alignment', line_id: 1, station_type_id: 2, sequence: 30, status: true },
      { station_code: 'ST-FRM-BRKT', name: 'Bracket & Mounting Install', line_id: 1, station_type_id: 2, sequence: 40, status: true },
      { station_code: 'ST-FRM-FQC', name: 'Frame Final Inspection', line_id: 1, station_type_id: 1, sequence: 50, status: true },
      
      // Line Assembly Electrical
      { station_code: 'ST-EL-WIRE', name: 'Wiring Harness Install', line_id: 3, station_type_id: 2, sequence: 10, status: true },
      { station_code: 'ST-EL-CTRL', name: 'Controller Install', line_id: 3, station_type_id: 2, sequence: 20, status: true },
      { station_code: 'ST-EL-MOTOR', name: 'Motor Install', line_id: 3, station_type_id: 2, sequence: 30, status: true },
      { station_code: 'ST-EL-BATT', name: 'Battery Mounting', line_id: 3, station_type_id: 2, sequence: 40, status: true },
      { station_code: 'ST-EL-TEST', name: 'Electrical Function Test', line_id: 3, station_type_id: 3, sequence: 50, status: true },
      
      // Line Assembly Final
      { station_code: 'ST-FNL-WHEEL', name: 'Wheel Assembly', line_id: 4, station_type_id: 2, sequence: 10, status: true },
      { station_code: 'ST-FNL-BRAKE', name: 'Brake Assembly', line_id: 4, station_type_id: 2, sequence: 20, status: true },
      { station_code: 'ST-FNL-HMI', name: 'Handlebar Assembly', line_id: 4, station_type_id: 2, sequence: 30, status: true },
      { station_code: 'ST-FNL-ACC', name: 'Lighting & Accessories', line_id: 4, station_type_id: 2, sequence: 40, status: true },
      { station_code: 'ST-FNL-FQC', name: 'Final Assembly Inspection', line_id: 4, station_type_id: 1, sequence: 50, status: true },
      
      // Line QC Final
      { station_code: 'ST-QC-ROAD', name: 'Road Test', line_id: 6, station_type_id: 3, sequence: 10, status: true },
      { station_code: 'ST-QC-AUDIT', name: 'Final Quality Audit', line_id: 6, station_type_id: 1, sequence: 20, status: true },
      
      // Line Packing
      { station_code: 'ST-PACK-PREP', name: 'Packing Preparation', line_id: 13, station_type_id: 6, sequence: 10, status: true },
      { station_code: 'ST-PACK-PROC', name: 'Packing Process', line_id: 13, station_type_id: 6, sequence: 20, status: true },

      // Line Finished Goods Storage
      { station_code: 'ST-WH-FG-TRF', name: 'Finished Goods Transfer', line_id: 14, station_type_id: 6, sequence: 10, status: true },


      { station_code: 'ST-PRM-CLEAN', name: 'Surface Cleaning', line_id: 8, station_type_id: 4, sequence: 10, status: true },
      { station_code: 'ST-PRM-SPRAY', name: 'Primer Spray', line_id: 8, station_type_id: 4, sequence: 20, status: true },
      { station_code: 'ST-PRM-OVEN', name: 'Oven Drying Primer', line_id: 8, station_type_id: 5, sequence: 30, status: true },
      { station_code: 'ST-PRM-QC', name: 'Primer Quality Check', line_id: 8, station_type_id: 1, sequence: 40, status: true },
      { station_code: 'ST-COL-SPRAY', name: 'Color Spray', line_id: 9, station_type_id: 4, sequence: 10, status: true },
      { station_code: 'ST-COL-OVEN', name: 'Oven Drying Color', line_id: 9, station_type_id: 5, sequence: 20, status: true },
      { station_code: 'ST-COL-QC', name: 'Color Defect Inspection', line_id: 9, station_type_id: 1, sequence: 30, status: true },
      { station_code: 'ST-COAT-CLEAN', name: 'Surface Final Cleaning', line_id: 10, station_type_id: 4, sequence: 10, status: true },
      { station_code: 'ST-COAT-SPRAY', name: 'Color Coat Spray', line_id: 10, station_type_id: 4, sequence: 20, status: true },
      { station_code: 'ST-COAT-OVEN', name: 'Oven Drying Color Coat', line_id: 10, station_type_id: 5, sequence: 30, status: true },
      { station_code: 'ST-COAT-THK', name: 'Color Coat Thickness Check', line_id: 10, station_type_id: 1, sequence: 40, status: true },
      { station_code: 'ST-COAT-VIS', name: 'Color Coat Visual Inspection', line_id: 10, station_type_id: 1, sequence: 50, status: true },
    ].map(s => ({ ...s, ...timestamp }));

    await queryInterface.bulkInsert('s_stations', stations);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_stations', null, {});
    await queryInterface.bulkDelete('ref_station_types', null, {});
    await queryInterface.bulkDelete('s_lines', null, {});
    await queryInterface.bulkDelete('s_factories', null, {});
  }
};