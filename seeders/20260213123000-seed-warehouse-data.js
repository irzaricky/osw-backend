export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    // 1. Seed Warehouse Categories
    const categories = [
      { id: 1, name: 'Raw Materials', ...timestamp },
      { id: 2, name: 'WIP', ...timestamp },
      { id: 3, name: 'Finish Good', ...timestamp }
    ];
    await queryInterface.bulkInsert('ref_warehouse_categories', categories, { ignoreDuplicates: true });

    // 2. Seed Defect Categories & Defects
    const defectCategories = [
      { name: 'Kerusakan Fisik', ...timestamp },
      { name: 'Cacat Dimensi', ...timestamp },
      { name: 'Kerusakan Kemasan', ...timestamp }
    ];
    await queryInterface.bulkInsert('ref_defect_categories', defectCategories, { ignoreDuplicates: true });

    const categoriesDB = await queryInterface.sequelize.query(
      `SELECT id, name FROM ref_defect_categories`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const catMap = {};
    categoriesDB.forEach(c => catMap[c.name] = c.id);

    const defects = [
      { category: 'Kerusakan Fisik', name: 'Retak', ...timestamp },
      { category: 'Kerusakan Fisik', name: 'Pecah', ...timestamp },
      { category: 'Kerusakan Fisik', name: 'Penyok', ...timestamp },
      { category: 'Kerusakan Fisik', name: 'Bengkok', ...timestamp },
      { category: 'Kerusakan Fisik', name: 'Patah', ...timestamp },
      { category: 'Cacat Dimensi', name: 'Ukuran tidak sesuai', ...timestamp },
      { category: 'Cacat Dimensi', name: 'Tebal tidak sesuai', ...timestamp },
      { category: 'Kerusakan Kemasan', name: 'Kemasan sobek', ...timestamp },
      { category: 'Kerusakan Kemasan', name: 'Kemasan basah', ...timestamp },
      { category: 'Kerusakan Kemasan', name: 'Segel rusak', ...timestamp }
    ].map(d => ({
      defect_category_id: catMap[d.category],
      name: d.name,
      active: true,
      created_at: new Date(),
      updated_at: new Date()
    })).filter(d => d.defect_category_id); // Ensure valid category

    await queryInterface.bulkInsert('s_defects', defects, { ignoreDuplicates: true });

    // 3. Seed Warehouses
    // Assuming Factory ID 2 is 'Factory Warehouse' from previous seed.
    // Assuming Line IDs: 'Line Material' (ID 12), 'Line Finish Good' (ID 14) from previous seed.
    const warehouses = [
      { id: 1, warehouse_code: 'WH-MAT-01', name: 'Main Material Warehouse', line_id: 12, category_id: 1, notes: 'Gudang utama penyimpanan sparepart & komponen vendor', ...timestamp },
      { id: 2, warehouse_code: 'WH-WIP-02', name: 'Work In Proggress warehouse', line_id: 12, category_id: 2, notes: 'Gudang menyimpan barang setengah jadi', ...timestamp },
      { id: 3, warehouse_code: 'WH-FG-03', name: 'Finish Good Warehouse', line_id: 14, category_id: 3, notes: 'Gudang penyimpanan sepeda yang sudah dirakit & packing', ...timestamp }
    ];
    await queryInterface.bulkInsert('s_warehouses', warehouses, { ignoreDuplicates: true });

    // 4. Seed Warehouse Areas
    const areas = [
      // WH-MAT-01 Areas
      { id: 1, area_code: 'AREA-ELEC', name: 'Electronic & Battery Zone', warehouse_id: 1, total_cols: 5, total_rows: 4, notes: 'Area khusus Baterai', ...timestamp },
      { id: 2, area_code: 'AREA-FRAME', name: 'Heavy Metal Zone', warehouse_id: 1, total_cols: 10, total_rows: 3, notes: 'Area khusus Frame, Fork, dan Logam berat', ...timestamp },
      { id: 3, area_code: 'AREA-SMALL', name: 'Small Parts Zone', warehouse_id: 1, total_cols: 5, total_rows: 4, notes: 'Area Baut, Mur, Kabel, Jari-jari', ...timestamp },
      { id: 4, area_code: 'AREA-TIRE', name: 'Rubber & Rim Zone', warehouse_id: 1, total_cols: 8, total_rows: 4, notes: 'Area Ban dan Velg', ...timestamp },
      
      // WH-WIP-02 Areas
      { id: 5, area_code: 'WIP-FRAME', name: 'WIP Frame & Fork', warehouse_id: 2, total_cols: 6, total_rows: 3, notes: 'Proses perakitan rangka', ...timestamp },
      { id: 6, area_code: 'WIP-WHEEL', name: 'WIP Wheel Assembly', warehouse_id: 2, total_cols: 6, total_rows: 3, notes: 'Perakitan roda & motor', ...timestamp },
      { id: 7, area_code: 'WIP-ELEC', name: 'WIP Electrical Assembly', warehouse_id: 2, total_cols: 5, total_rows: 3, notes: 'Instalasi baterai & controller', ...timestamp },
      { id: 8, area_code: 'WIP-GENERAL', name: 'WIP General Assembly', warehouse_id: 2, total_cols: 6, total_rows: 4, notes: 'Perakitan akhir sepeda', ...timestamp },

      // WH-FG-03 Areas
      { id: 9, area_code: 'AREA-VOLT', name: 'VoltCity Staging Area', warehouse_id: 3, total_cols: 6, total_rows: 2, notes: 'Area khusus Sepeda Volt (Box Besar)', ...timestamp },
      { id: 10, area_code: 'AREA-ECO', name: 'EcoFold Staging Area', warehouse_id: 3, total_cols: 5, total_rows: 3, notes: 'Area khusus Sepeda Eco (Box Standart)', ...timestamp },
      
      // Extra Area for Rejects (implied by bins) - assigning to WH-MAT-01 for now
      { id: 11, area_code: 'AREA-REJECT', name: 'Quarantine Area', warehouse_id: 1, total_cols: 5, total_rows: 5, notes: 'Area Barang NG', ...timestamp }
    ];
    await queryInterface.bulkInsert('s_warehouse_areas', areas, { ignoreDuplicates: true });

    // 5. Seed Warehouse Bins
    const bins = [
      { bin_code: 'BIN-EL-01-A', area_id: 1, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'PART-BATT-48V', capacity: 500, ...timestamp },
      { bin_code: 'BIN-EL-01-B', area_id: 1, col_index: 1, row_index: 2, is_dedicated: true, dedicated_part_number: 'PART-BATT-36V', capacity: 500, ...timestamp },
      { bin_code: 'BIN-EL-02-A', area_id: 1, col_index: 1, row_index: 3, is_dedicated: false, dedicated_part_number: null, capacity: 1000, ...timestamp },
      
      { bin_code: 'BIN-FR-01-A', area_id: 2, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'PART-FRAME-VC', capacity: 50, ...timestamp },
      { bin_code: 'BIN-FR-01-B', area_id: 2, col_index: 1, row_index: 2, is_dedicated: true, dedicated_part_number: 'PART-FRAME-EF', capacity: 50, ...timestamp },
      
      { bin_code: 'BIN-SM-01-A', area_id: 3, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'PART-NUT-M12', capacity: 10000, ...timestamp },
      { bin_code: 'BIN-SM-01-B', area_id: 3, col_index: 1, row_index: 2, is_dedicated: false, dedicated_part_number: null, capacity: 5000, ...timestamp },
      
      { bin_code: 'BIN-TR-01-A', area_id: 4, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'PART-TIRE-26', capacity: 200, ...timestamp },
      { bin_code: 'BIN-TR-01-B', area_id: 4, col_index: 1, row_index: 2, is_dedicated: true, dedicated_part_number: 'PART-TIRE-20', capacity: 200, ...timestamp },
      
      { bin_code: 'BIN-FG-VO-01', area_id: 9, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'VOBKME2025', capacity: 20, ...timestamp },
      { bin_code: 'BIN-FG-VO-02', area_id: 9, col_index: 1, row_index: 2, is_dedicated: true, dedicated_part_number: 'VOWHME2025', capacity: 20, ...timestamp },
      
      { bin_code: 'BIN-FG-EC-01', area_id: 10, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'ECBKME2025', capacity: 30, ...timestamp },
      
      { bin_code: 'BIN-NG-01', area_id: 11, col_index: 1, row_index: 1, is_dedicated: false, dedicated_part_number: null, capacity: 1000, ...timestamp }
    ];
    await queryInterface.bulkInsert('s_warehouse_bins', bins, { ignoreDuplicates: true });

    // 6. Seed Docks
    const docks = [
      { dock_code: 'DCK-01', name: 'Dock Utama', area_id: 2, ...timestamp }, // AREA-FRAME
      { dock_code: 'DCK-02', name: 'Dock Samping', area_id: 2, ...timestamp }, // AREA-FRAME
      { dock_code: 'DCK-03', name: 'Dock Gerbang Utara', area_id: 3, ...timestamp }, // AREA-SMALL
      { dock_code: 'DCK-04', name: 'Dock Gerbang Timur', area_id: 3, ...timestamp }, // AREA-SMALL
      { dock_code: 'DCK-05', name: 'Dock Gerbang Selatan', area_id: 3, ...timestamp }, // AREA-SMALL
      { dock_code: 'DCK-06', name: 'Dock Gerbang Atas', area_id: 3, ...timestamp }, // AREA-SMALL
      { dock_code: 'DCK-07', name: 'Dock Utama', area_id: 9, ...timestamp }, // AREA-VOLT
      { dock_code: 'DCK-08', name: 'Dock Samping', area_id: 10, ...timestamp }, // AREA-ECO
      { dock_code: 'DCK-09', name: 'Dock Gerbang Atas', area_id: 9, ...timestamp } // AREA-VOLT
    ];
    await queryInterface.bulkInsert('s_docks', docks, { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_docks', null, {});
    await queryInterface.bulkDelete('s_warehouse_bins', null, {});
    await queryInterface.bulkDelete('s_warehouse_areas', null, {});
    await queryInterface.bulkDelete('s_warehouses', null, {});
    await queryInterface.bulkDelete('s_defects', null, {});
    await queryInterface.bulkDelete('ref_defect_categories', null, {});
    // await queryInterface.bulkDelete('ref_defects', null, {}); // Deprecated
    await queryInterface.bulkDelete('ref_warehouse_categories', null, {});
  }
};
