export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    // 1. Seed Ref Package Types
    const packageTypes = [
      { name: 'FINISH GOOD', description: 'Finished goods ready for sale', ...timestamp },
      { name: 'RAW MATERIAL', description: 'Raw materials for production', ...timestamp }
    ];
    await queryInterface.bulkInsert('ref_package_types', packageTypes, { ignoreDuplicates: true });

    // 2. Seed Ref Job Types
    const jobTypes = [
      { name: 'INSPECTION', description: 'Quality inspection tasks', ...timestamp },
      { name: 'ASSEMBLY', description: 'Assembly operations', ...timestamp },
      { name: 'TESTING', description: 'Functional and safety testing', ...timestamp },
      { name: 'PAINTING', description: 'Painting and coating operations', ...timestamp },
      { name: 'OVEN', description: 'Drying and curing operations', ...timestamp },
      { name: 'PACKING', description: 'Packing and labeling operations', ...timestamp },
      { name: 'SYSTEM', description: 'System-related tasks', ...timestamp }
    ];
    await queryInterface.bulkInsert('ref_job_types', jobTypes, { ignoreDuplicates: true });

    // helper to get IDs
    const getPackageTypeId = async (name) => {
      const type = await queryInterface.sequelize.query(
        `SELECT id FROM ref_package_types WHERE name = '${name}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return type[0]?.id;
    };

    const getJobTypeId = async (name) => {
      const type = await queryInterface.sequelize.query(
        `SELECT id FROM ref_job_types WHERE name = '${name}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return type[0]?.id;
    };

    const finishGoodId = await getPackageTypeId('FINISH GOOD');
    const rawMaterialId = await getPackageTypeId('RAW MATERIAL');

    // 3. Seed Packages
    const packages = [
      { package_code: 'PKG-STD-M', name: 'Box Sepeda Standar', package_type_id: finishGoodId, capacity: 1, load: 1, notes: 'Sepeda Jadi (EcoFold)', ...timestamp },
      { package_code: 'PKG-STD-L', name: 'Box Sepeda Large', package_type_id: finishGoodId, capacity: 1, load: 1.5, notes: 'Sepeda Jadi (VoltCity)', ...timestamp },
      { package_code: 'PKG-CRT-L', name: 'Crate/Pallet Frame', package_type_id: rawMaterialId, capacity: 5, load: null, notes: 'Frame Mentah', ...timestamp },
      { package_code: 'PKG-BOX-L', name: 'Box Komponen Large', package_type_id: rawMaterialId, capacity: 5, load: null, notes: 'Velg, Ban Luar, Fork', ...timestamp },
      { package_code: 'PKG-BOX-M', name: 'Box Komponen Medium', package_type_id: rawMaterialId, capacity: 10, load: null, notes: 'Stang, Sadel, Standar, Pedal', ...timestamp },
      { package_code: 'PKG-BOX-S', name: 'Box Komponen Small', package_type_id: rawMaterialId, capacity: 20, load: null, notes: 'Controller, Display, Brake Set, Hub', ...timestamp },
      { package_code: 'PKG-TRAY-50', name: 'Tray Pack', package_type_id: rawMaterialId, capacity: 50, load: null, notes: 'Sel Baterai (18650)', ...timestamp },
      { package_code: 'PKG-BULK-S', name: 'Box Small Bulk', package_type_id: rawMaterialId, capacity: 100, load: null, notes: 'Jari-jari, Baut Besar, Bearing', ...timestamp },
      { package_code: 'PKG-BULK-L', name: 'Box Large Bulk', package_type_id: rawMaterialId, capacity: 500, load: null, notes: 'Mur Kecil (Nuts), Ring, Skrup', ...timestamp }
    ];
    await queryInterface.bulkInsert('s_packages', packages, { ignoreDuplicates: true });

    // 4. Seed Jobs
    const jobTypeMap = {};
    for (const jt of jobTypes) {
      jobTypeMap[jt.name] = await getJobTypeId(jt.name);
    }

    const jobs = [
      { job_code: 'JOB-INSP-DIM', name: 'Check Frame Dimension', type: 'INSPECTION', standard_time: 120, active: true },
      { job_code: 'JOB-INSP-WELD', name: 'Welding Joint Inspection', type: 'INSPECTION', standard_time: 240, active: true },
      { job_code: 'JOB-ALIGN-FRM', name: 'Frame Alignment Setting', type: 'ASSEMBLY', standard_time: 300, active: true },
      { job_code: 'JOB-INST-BRKT', name: 'Install Frame Bracket', type: 'ASSEMBLY', standard_time: 360, active: true },
      { job_code: 'JOB-QC-FRM', name: 'Final Frame QC', type: 'INSPECTION', standard_time: 180, active: true },
      { job_code: 'JOB-INST-WIRE', name: 'Install Wiring Harness', type: 'ASSEMBLY', standard_time: 360, active: true },
      { job_code: 'JOB-INST-CTRL', name: 'Install Controller Unit', type: 'ASSEMBLY', standard_time: 300, active: true },
      { job_code: 'JOB-INST-MOTOR', name: 'Install Motor Hub', type: 'ASSEMBLY', standard_time: 420, active: true },
      { job_code: 'JOB-INST-BATT', name: 'Install Battery Pack', type: 'ASSEMBLY', standard_time: 360, active: true },
      { job_code: 'JOB-TEST-ELEC', name: 'Electrical Functional Test', type: 'TESTING', standard_time: 300, active: true },
      { job_code: 'JOB-SPRAY-PRM', name: 'Primer Spray', type: 'PAINTING', standard_time: 360, active: true },
      { job_code: 'JOB-OVEN-PRM', name: 'Oven Drying Primer', type: 'OVEN', standard_time: 900, active: true },
      { job_code: 'JOB-QC-PRM', name: 'Primer Quality Check', type: 'INSPECTION', standard_time: 180, active: true },
      { job_code: 'JOB-SPRAY-COL', name: 'Color Spray', type: 'PAINTING', standard_time: 480, active: true },
      { job_code: 'JOB-OVEN-COL', name: 'Oven Drying Color', type: 'OVEN', standard_time: 1200, active: true },
      { job_code: 'JOB-QC-COL', name: 'Color Defect Inspection', type: 'INSPECTION', standard_time: 240, active: true },
      { job_code: 'JOB-CLEAN-FNL', name: 'Final Surface Cleaning', type: 'PAINTING', standard_time: 180, active: true },
      { job_code: 'JOB-SPRAY-COAT', name: 'Color Coat Spray', type: 'PAINTING', standard_time: 360, active: true },
      { job_code: 'JOB-OVEN-COAT', name: 'Oven Drying Color Coat', type: 'OVEN', standard_time: 1080, active: true },
      { job_code: 'JOB-INSP-THK', name: 'Measure Paint Thickness', type: 'INSPECTION', standard_time: 180, active: true },
      { job_code: 'JOB-INSP-VIS', name: 'Visual Paint Inspection', type: 'INSPECTION', standard_time: 180, active: true },
      { job_code: 'JOB-PACK-ACC', name: 'Accessories Packing', type: 'PACKING', standard_time: 240, active: true },
      { job_code: 'JOB-PACK-WRAP', name: 'Bike Wrapping', type: 'PACKING', standard_time: 300, active: true },
      { job_code: 'JOB-PACK-CART', name: 'Carton Packing', type: 'PACKING', standard_time: 360, active: true },
      { job_code: 'JOB-PACK-LBL', name: 'Labeling & Barcode', type: 'PACKING', standard_time: 120, active: true },
      { job_code: 'JOB-TEST-ROAD', name: 'Road / Dyno Test', type: 'TESTING', standard_time: 480, active: true },
      { job_code: 'JOB-TEST-SAFE', name: 'Electrical Safety Test', type: 'TESTING', standard_time: 300, active: true },
      { job_code: 'JOB-REL-WH', name: 'Release to Warehouse', type: 'SYSTEM', standard_time: 120, active: true },
      
      // Additional derived jobs
      { job_code: 'JOB-CHECK-VIS', name: 'Check Frame Visual Defect', type: 'INSPECTION', standard_time: 120, active: true },
      { job_code: 'JOB-CHECK-STR', name: 'Check Weld Strength', type: 'INSPECTION', standard_time: 120, active: true },
      { job_code: 'JOB-VER-GEO', name: 'Verify Frame Geometry', type: 'INSPECTION', standard_time: 120, active: true },
      { job_code: 'JOB-TRQ-BRKT', name: 'Torque Bracket Bolt', type: 'ASSEMBLY', standard_time: 120, active: true },
      { job_code: 'JOB-RT-WIRE', name: 'Route & Clamp Wiring', type: 'ASSEMBLY', standard_time: 120, active: true },
      { job_code: 'JOB-CN-CTRL', name: 'Connect Controller Wiring', type: 'ASSEMBLY', standard_time: 120, active: true },
      { job_code: 'JOB-CN-MTR', name: 'Motor Wiring Connection', type: 'ASSEMBLY', standard_time: 120, active: true },
      { job_code: 'JOB-SEC-BATT', name: 'Secure Battery Lock', type: 'ASSEMBLY', standard_time: 120, active: true },
      { job_code: 'JOB-ERR-CODE', name: 'Error Code Verification', type: 'TESTING', standard_time: 120, active: true },
      { job_code: 'JOB-INST-WHL', name: 'Install Front & Rear Wheel', type: 'ASSEMBLY', standard_time: 240, active: true },
      { job_code: 'JOB-INST-BRK', name: 'Install Brake System', type: 'ASSEMBLY', standard_time: 240, active: true },
      { job_code: 'JOB-ADJ-BRK', name: 'Brake Adjustment', type: 'ASSEMBLY', standard_time: 180, active: true },
      { job_code: 'JOB-INST-HND', name: 'Install Handlebar', type: 'ASSEMBLY', standard_time: 180, active: true },
      { job_code: 'JOB-ALN-HND', name: 'Handlebar Alignment', type: 'ASSEMBLY', standard_time: 120, active: true },
      { job_code: 'JOB-INST-ACC', name: 'Install Lamp & Accessories', type: 'ASSEMBLY', standard_time: 180, active: true },
      { job_code: 'JOB-CHK-ASSY', name: 'Overall Assembly Check', type: 'INSPECTION', standard_time: 180, active: true },
      { job_code: 'JOB-CHK-TRQ', name: 'Torque Final Check', type: 'INSPECTION', standard_time: 120, active: true },
      { job_code: 'JOB-SIM-ROAD', name: 'Road Test Simulation', type: 'TESTING', standard_time: 300, active: true },
      { job_code: 'JOB-TST-BRK', name: 'Brake & Acceleration Test', type: 'TESTING', standard_time: 180, active: true },
      { job_code: 'JOB-VIS-FIN', name: 'Final Visual Inspection', type: 'INSPECTION', standard_time: 180, active: true },
      { job_code: 'JOB-APP-FUN', name: 'Functional Approval', type: 'INSPECTION', standard_time: 60, active: true },
      { job_code: 'JOB-CLN-UNIT', name: 'Cleaning Unit', type: 'PACKING', standard_time: 120, active: true },
      { job_code: 'JOB-ATT-LBL', name: 'Attach Manual & Label', type: 'PACKING', standard_time: 60, active: true },
      { job_code: 'JOB-PCK-BOX', name: 'Pack E-Bike into Carton', type: 'PACKING', standard_time: 240, active: true },
      { job_code: 'JOB-SEAL-BOX', name: 'Seal & Strap Carton', type: 'PACKING', standard_time: 120, active: true },
      { job_code: 'JOB-MOV-FG', name: 'Move to FG Area', type: 'SYSTEM', standard_time: 120, active: true },
      { job_code: 'JOB-SCN-SN', name: 'Scan Serial Number', type: 'SYSTEM', standard_time: 60, active: true }
    ].map(j => ({
      job_code: j.job_code,
      name: j.name,
      job_type_id: jobTypeMap[j.type],
      standard_time: j.standard_time,
      active: j.active,
      ...timestamp
    }));

    await queryInterface.bulkInsert('s_jobs', jobs, { ignoreDuplicates: true });

    // 5. Seed Shifts (Clean & Continuous 24-Hour Operations)
    const shifts = [
      // ── SHIFT 1 (Pagi: 07:00 - 15:00) ────────────────────────────────────────
      { name: 'Shift 1', shift_number: 1, type: 'REGULAR', start_time: '07:00:00', end_time: '11:30:00', category: 'PRODUCTIVE', description: 'Shift Pagi', active: true, ...timestamp },
      { name: 'Shift 1', shift_number: 1, type: 'REGULAR', start_time: '11:30:00', end_time: '12:30:00', category: 'BREAK', description: 'ISHOMA', active: true, ...timestamp },
      { name: 'Shift 1', shift_number: 1, type: 'REGULAR', start_time: '12:30:00', end_time: '15:00:00', category: 'PRODUCTIVE', description: 'Shift Pagi Lanjutan', active: true, ...timestamp },

      // ── SHIFT 2 (Sore: 15:00 - 23:00) ────────────────────────────────────────
      { name: 'Shift 2', shift_number: 2, type: 'REGULAR', start_time: '15:00:00', end_time: '18:00:00', category: 'PRODUCTIVE', description: 'Shift Sore', active: true, ...timestamp },
      { name: 'Shift 2', shift_number: 2, type: 'REGULAR', start_time: '18:00:00', end_time: '18:30:00', category: 'BREAK', description: 'Istirahat Maghrib', active: true, ...timestamp },
      { name: 'Shift 2', shift_number: 2, type: 'REGULAR', start_time: '18:30:00', end_time: '23:00:00', category: 'PRODUCTIVE', description: 'Shift Sore Lanjutan', active: true, ...timestamp },

      // ── SHIFT 3 (Malam: 23:00 - 07:00) ───────────────────────────────────────
      { name: 'Shift 3', shift_number: 3, type: 'REGULAR', start_time: '23:00:00', end_time: '02:30:00', category: 'PRODUCTIVE', description: 'Shift Malam', active: true, ...timestamp },
      { name: 'Shift 3', shift_number: 3, type: 'REGULAR', start_time: '02:30:00', end_time: '03:00:00', category: 'BREAK', description: 'Istirahat Malam', active: true, ...timestamp },
      { name: 'Shift 3', shift_number: 3, type: 'REGULAR', start_time: '03:00:00', end_time: '07:00:00', category: 'PRODUCTIVE', description: 'Shift Malam Lanjutan', active: true, ...timestamp }
    ];

    await queryInterface.bulkInsert('s_shifts', shifts, { ignoreDuplicates: true });

    // 6. Seed Station Jobs
    const DB_stations = await queryInterface.sequelize.query(
      `SELECT id, name FROM s_stations`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const DB_jobs = await queryInterface.sequelize.query(
      `SELECT id, name FROM s_jobs`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const findStation = (name) => DB_stations.find(s => s.name === name)?.id;
    const findJob = (name) => DB_jobs.find(j => j.name === name)?.id;

    const stationJobsData = [
      { station: 'Incoming Frame Inspection', job: 'Check Frame Dimension', sequence: 1, mandatory: 1 },
      { station: 'Incoming Frame Inspection', job: 'Check Frame Visual Defect', sequence: 2, mandatory: 1 },
      { station: 'Frame Welding Check', job: 'Welding Joint Inspection', sequence: 1, mandatory: 1 },
      { station: 'Frame Welding Check', job: 'Check Weld Strength', sequence: 2, mandatory: 1 },
      { station: 'Frame Alignment', job: 'Frame Alignment Setting', sequence: 1, mandatory: 1 },
      { station: 'Frame Alignment', job: 'Verify Frame Geometry', sequence: 2, mandatory: 1 },
      { station: 'Bracket & Mounting Install', job: 'Install Frame Bracket', sequence: 1, mandatory: 1 },
      { station: 'Bracket & Mounting Install', job: 'Torque Bracket Bolt', sequence: 2, mandatory: 1 },
      { station: 'Frame Final Inspection', job: 'Final Frame QC', sequence: 1, mandatory: 1 },
      { station: 'Wiring Harness Install', job: 'Install Wiring Harness', sequence: 1, mandatory: 1 },
      { station: 'Wiring Harness Install', job: 'Route & Clamp Wiring', sequence: 2, mandatory: 1 },
      { station: 'Controller Install', job: 'Install Controller Unit', sequence: 1, mandatory: 1 },
      { station: 'Controller Install', job: 'Connect Controller Wiring', sequence: 2, mandatory: 1 },
      { station: 'Motor Install', job: 'Install Motor Hub', sequence: 1, mandatory: 1 },
      { station: 'Motor Install', job: 'Motor Wiring Connection', sequence: 2, mandatory: 1 },
      { station: 'Battery Mounting', job: 'Install Battery Pack', sequence: 1, mandatory: 1 },
      { station: 'Battery Mounting', job: 'Secure Battery Lock', sequence: 2, mandatory: 1 },
      { station: 'Electrical Function Test', job: 'Electrical Functional Test', sequence: 1, mandatory: 1 },
      { station: 'Electrical Function Test', job: 'Error Code Verification', sequence: 2, mandatory: 1 },
      { station: 'Wheel Assembly', job: 'Install Front & Rear Wheel', sequence: 1, mandatory: 1 },
      { station: 'Brake Assembly', job: 'Install Brake System', sequence: 1, mandatory: 1 },
      { station: 'Brake Assembly', job: 'Brake Adjustment', sequence: 2, mandatory: 1 },
      { station: 'Handlebar Assembly', job: 'Install Handlebar', sequence: 1, mandatory: 1 },
      { station: 'Handlebar Assembly', job: 'Handlebar Alignment', sequence: 2, mandatory: 1 },
      { station: 'Lighting & Accessories', job: 'Install Lamp & Accessories', sequence: 1, mandatory: 0 },
      { station: 'Final Assembly Inspection', job: 'Overall Assembly Check', sequence: 1, mandatory: 1 },
      { station: 'Final Assembly Inspection', job: 'Torque Final Check', sequence: 2, mandatory: 1 },
      { station: 'Road Test', job: 'Road Test Simulation', sequence: 1, mandatory: 1 },
      { station: 'Road Test', job: 'Brake & Acceleration Test', sequence: 2, mandatory: 1 },
      { station: 'Final Quality Audit', job: 'Final Visual Inspection', sequence: 1, mandatory: 1 },
      { station: 'Final Quality Audit', job: 'Functional Approval', sequence: 2, mandatory: 1 },
      { station: 'Packing Preparation', job: 'Cleaning Unit', sequence: 1, mandatory: 1 },
      { station: 'Packing Preparation', job: 'Attach Manual & Label', sequence: 2, mandatory: 1 },
      { station: 'Packing Process', job: 'Pack E-Bike into Carton', sequence: 1, mandatory: 1 },
      { station: 'Packing Process', job: 'Seal & Strap Carton', sequence: 2, mandatory: 1 },
      { station: 'Finished Goods Transfer', job: 'Move to FG Area', sequence: 1, mandatory: 1 },
      { station: 'Finished Goods Transfer', job: 'Scan Serial Number', sequence: 2, mandatory: 1 },
    ];

    const stationJobs = [];
    for (const item of stationJobsData) {
      const stationId = findStation(item.station);
      const jobId = findJob(item.job);
      if (stationId && jobId) {
        stationJobs.push({
          station_id: stationId,
          job_id: jobId,
          sequence: item.sequence,
          mandatory: item.mandatory === 1,
          active: true,
          ...timestamp
        });
      }
    }

    if (stationJobs.length > 0) {
      await queryInterface.bulkInsert('s_station_jobs', stationJobs, { ignoreDuplicates: true });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_station_jobs', null, {});
    await queryInterface.bulkDelete('s_shifts', null, {});
    await queryInterface.bulkDelete('s_jobs', null, {});
    await queryInterface.bulkDelete('s_packages', null, {});
    await queryInterface.bulkDelete('ref_job_types', null, {});
    await queryInterface.bulkDelete('ref_package_types', null, {});
  }
};
