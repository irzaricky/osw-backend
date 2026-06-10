export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    // 1. Seed Warehouse Categories
    const categories = [
      { name: 'Raw Materials', ...timestamp },
      { name: 'WIP', ...timestamp },
      { name: 'Finish Good', ...timestamp }
    ];
    await queryInterface.bulkInsert('ref_warehouse_categories', categories, { ignoreDuplicates: true });

    // 2. Seed Defect Categories & Defects
    const defectCategories = [
      { name: 'Physical Damage', ...timestamp },
      { name: 'Dimensional Defect', ...timestamp },
      { name: 'Packaging Damage', ...timestamp }
    ];
    await queryInterface.bulkInsert('ref_defect_categories', defectCategories, { ignoreDuplicates: true });

    const categoriesDB = await queryInterface.sequelize.query(
      `SELECT id, name FROM ref_defect_categories`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const catMap = {};
    categoriesDB.forEach(c => catMap[c.name] = c.id);

    const defects = [
      { category: 'Physical Damage', name: 'Crack', ...timestamp },
      { category: 'Physical Damage', name: 'Broken', ...timestamp },
      { category: 'Physical Damage', name: 'Dent', ...timestamp },
      { category: 'Physical Damage', name: 'Bent', ...timestamp },
      { category: 'Physical Damage', name: 'Fractured', ...timestamp },
      { category: 'Dimensional Defect', name: 'Incorrect Size', ...timestamp },
      { category: 'Dimensional Defect', name: 'Incorrect Thickness', ...timestamp },
      { category: 'Packaging Damage', name: 'Torn Packaging', ...timestamp },
      { category: 'Packaging Damage', name: 'Wet Packaging', ...timestamp },
      { category: 'Packaging Damage', name: 'Broken Seal', ...timestamp }
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
      { warehouse_code: 'WH-MAT-01', name: 'Main Material Warehouse', line_id: 12, category_id: 1, notes: 'Gudang utama penyimpanan sparepart & komponen vendor', ...timestamp },
      { warehouse_code: 'WH-WIP-02', name: 'Work In Progress Warehouse', line_id: 12, category_id: 2, notes: 'Gudang menyimpan barang setengah jadi', ...timestamp },
      { warehouse_code: 'WH-FG-03', name: 'Finish Good Warehouse', line_id: 14, category_id: 3, notes: 'Gudang penyimpanan sepeda yang sudah dirakit & packing', ...timestamp }
    ];
    await queryInterface.bulkInsert('s_warehouses', warehouses, { ignoreDuplicates: true });

    // 4. Seed Warehouse Areas
    const areas = [
      // WH-MAT-01 Areas
      { area_code: 'AREA-ELEC', name: 'Electronic & Battery Zone', warehouse_id: 1, total_cols: 5, total_rows: 4, notes: 'Area khusus Baterai', ...timestamp },
      { area_code: 'AREA-FRAME', name: 'Heavy Metal Zone', warehouse_id: 1, total_cols: 10, total_rows: 3, notes: 'Area khusus Frame, Fork, dan Logam berat', ...timestamp },
      { area_code: 'AREA-SMALL', name: 'Small Parts Zone', warehouse_id: 1, total_cols: 5, total_rows: 4, notes: 'Area Baut, Mur, Kabel, Jari-jari', ...timestamp },
      { area_code: 'AREA-TIRE', name: 'Rubber & Rim Zone', warehouse_id: 1, total_cols: 8, total_rows: 4, notes: 'Area Ban dan Velg', ...timestamp },
      
      // WH-WIP-02 Areas
      { area_code: 'WIP-FRAME', name: 'WIP Frame & Fork', warehouse_id: 2, total_cols: 6, total_rows: 3, notes: 'Proses perakitan rangka', ...timestamp },
      { area_code: 'WIP-WHEEL', name: 'WIP Wheel Assembly', warehouse_id: 2, total_cols: 6, total_rows: 3, notes: 'Perakitan roda & motor', ...timestamp },
      { area_code: 'WIP-ELEC', name: 'WIP Electrical Assembly', warehouse_id: 2, total_cols: 5, total_rows: 3, notes: 'Instalasi baterai & controller', ...timestamp },
      { area_code: 'WIP-GENERAL', name: 'WIP General Assembly', warehouse_id: 2, total_cols: 6, total_rows: 4, notes: 'Perakitan akhir sepeda', ...timestamp },

      // WH-FG-03 Areas
      { area_code: 'AREA-VOLT', name: 'VoltCity Staging Area', warehouse_id: 3, total_cols: 6, total_rows: 2, notes: 'Area khusus Sepeda Volt (Box Besar)', ...timestamp },
      { area_code: 'AREA-ECO', name: 'EcoFold Staging Area', warehouse_id: 3, total_cols: 5, total_rows: 3, notes: 'Area khusus Sepeda Eco (Box Standart)', ...timestamp },
      
      // Extra Area for Rejects (implied by bins) - assigning to WH-MAT-01 for now
      { area_code: 'AREA-REJECT', name: 'Quarantine Area', warehouse_id: 1, total_cols: 5, total_rows: 5, notes: 'Area Barang NG', ...timestamp }
    ];
    await queryInterface.bulkInsert('s_warehouse_areas', areas, { ignoreDuplicates: true });

    // 5. Seed Warehouse Bins
      const bins = [
        { bin_code: 'AREA-ELEC-R1C1', area_id: 1, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'PART-BMS-48V', capacity: 500, ...timestamp },
        { bin_code: 'AREA-ELEC-R2C1', area_id: 1, col_index: 1, row_index: 2, is_dedicated: true, dedicated_part_number: 'PART-BMS-36V', capacity: 500, ...timestamp },
        { bin_code: 'AREA-ELEC-R3C1', area_id: 1, col_index: 1, row_index: 3, is_dedicated: false, dedicated_part_number: null, capacity: 1000, ...timestamp },

        { bin_code: 'AREA-SMALL-R1C1', area_id: 3, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'PART-NUT-M12', capacity: 10000, ...timestamp },
        { bin_code: 'AREA-SMALL-R1C2', area_id: 3, col_index: 1, row_index: 2, is_dedicated: false, dedicated_part_number: null, capacity: 5000, ...timestamp },

        { bin_code: 'AREA-TIRE-R1C1', area_id: 4, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'PART-TIRE-26', capacity: 200, ...timestamp },
        { bin_code: 'AREA-TIRE-R2C1', area_id: 4, col_index: 1, row_index: 2, is_dedicated: true, dedicated_part_number: 'PART-TIRE-20', capacity: 200, ...timestamp },

        { bin_code: 'AREA-VOLT-R1C1', area_id: 9, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'VOBKME2025', capacity: 20, ...timestamp },
        { bin_code: 'AREA-VOLT-R2C1', area_id: 9, col_index: 1, row_index: 2, is_dedicated: true, dedicated_part_number: 'VOWHME2025', capacity: 20, ...timestamp },

        { bin_code: 'AREA-ECO-R1C1', area_id: 10, col_index: 1, row_index: 1, is_dedicated: true, dedicated_part_number: 'ECBKME2025', capacity: 30, ...timestamp },

        { bin_code: 'AREA-REJECT-R1C1', area_id: 11, col_index: 1, row_index: 1, is_dedicated: false, dedicated_part_number: null, capacity: 1000, ...timestamp }
      ];

      // Generate Free Bin Unconfigured untuk slot area yang belum punya bin
      const warehouseAreas = await queryInterface.sequelize.query(
        `
          SELECT id, area_code, total_rows, total_cols
          FROM s_warehouse_areas
          WHERE deleted_at IS NULL
        `,
        {
          type: Sequelize.QueryTypes.SELECT
        }
      );

      for (const area of warehouseAreas) {
        for (let row = 1; row <= Number(area.total_rows || 0); row++) {
          for (let col = 1; col <= Number(area.total_cols || 0); col++) {
            const alreadyExists = bins.some(
              bin =>
                Number(bin.area_id) === Number(area.id) &&
                Number(bin.row_index) === row &&
                Number(bin.col_index) === col
            );

            if (!alreadyExists) {
              bins.push({
                bin_code: `${area.area_code}-R${row}C${col}`,
                area_id: area.id,
                row_index: row,
                col_index: col,
                is_dedicated: false,
                dedicated_part_number: null,
                capacity: 0,
                ...timestamp
              });
            }
          }
        }
      }

      await queryInterface.bulkInsert('s_warehouse_bins', bins, {
        ignoreDuplicates: true
      });

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

    // Reset sequences for Postgres
    if (queryInterface.sequelize.options.dialect === 'postgres') {
        await queryInterface.sequelize.query("SELECT setval('ref_warehouse_categories_id_seq', (SELECT MAX(id) FROM ref_warehouse_categories));");
        await queryInterface.sequelize.query("SELECT setval('s_warehouses_id_seq', (SELECT MAX(id) FROM s_warehouses));");
        await queryInterface.sequelize.query("SELECT setval('s_warehouse_areas_id_seq', (SELECT MAX(id) FROM s_warehouse_areas));");
    }
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
