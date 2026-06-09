import bcrypt from "bcryptjs";

/**
 * Seeder: Complete line setup for production plan testing
 * Covers all 14 lines with stations, jobs, employee groups, and operators.
 *
 * Prerequisites:
 * - s_factories, s_lines, ref_station_types seeded
 * - s_jobs, ref_job_types seeded
 * - s_roles with FOREMAN seeded
 * - parts id 1-12 are product type
 */
export default {
  async up(queryInterface) {
    const now = new Date();
    const ts  = { created_at: now, updated_at: now };

    const q = (sql) =>
      queryInterface.sequelize.query(sql, {
        type: queryInterface.sequelize.QueryTypes.SELECT,
      });

    // ── Helpers ──────────────────────────────────────────────────────────────

    const findLine    = (rows, code) => rows.find((r) => r.line_code    === code)?.id;
    const findStation = (rows, code) => rows.find((r) => r.station_code === code)?.id;
    const findJob     = (rows, code) => rows.find((r) => r.job_code     === code)?.id;
    const findStType  = (rows, name) => rows.find((r) => r.name         === name)?.id;

    // ── Fetch existing master data ────────────────────────────────────────────

    const lines   = await q(`SELECT id, line_code FROM s_lines WHERE deleted_at IS NULL`);
    const stTypes = await q(`SELECT id, name FROM ref_station_types`);

    const ST = {
      INSPECTION: findStType(stTypes, 'INSPECTION'),
      ASSEMBLY:   findStType(stTypes, 'ASSEMBLY'),
      TESTING:    findStType(stTypes, 'TESTING'),
      PAINTING:   findStType(stTypes, 'PAINTING'),
      OVEN:       findStType(stTypes, 'OVEN'),
      PACKING:    findStType(stTypes, 'PACKING'),
    };

    // ── 1. Stations ───────────────────────────────────────────────────────────
    const newStations = [
      // ── Line 2 — Battery Assembly ─────────────────────────────────────────
      { station_code: 'ST-BATT-CELL',  name: 'Cell Incoming Inspection', line_id: findLine(lines, 'ASSY-BATT'), station_type_id: ST.INSPECTION, sequence: 10, status: true },
      { station_code: 'ST-BATT-ASSY',  name: 'Battery Pack Assembly',    line_id: findLine(lines, 'ASSY-BATT'), station_type_id: ST.ASSEMBLY,   sequence: 20, status: true },
      { station_code: 'ST-BATT-TEST',  name: 'Battery Charge Test',      line_id: findLine(lines, 'ASSY-BATT'), station_type_id: ST.TESTING,    sequence: 30, status: true },
      { station_code: 'ST-BATT-QC',    name: 'Battery Final QC',         line_id: findLine(lines, 'ASSY-BATT'), station_type_id: ST.INSPECTION, sequence: 40, status: true },

      // ── Line 5 — Charging & Testing ───────────────────────────────────────
      { station_code: 'ST-TST-CHG',    name: 'Charging Station',         line_id: findLine(lines, 'ASSY-TEST'), station_type_id: ST.TESTING,    sequence: 10, status: true },
      { station_code: 'ST-TST-ELEC',   name: 'Electrical Safety Check',  line_id: findLine(lines, 'ASSY-TEST'), station_type_id: ST.TESTING,    sequence: 20, status: true },
      { station_code: 'ST-TST-PERF',   name: 'Performance Test',         line_id: findLine(lines, 'ASSY-TEST'), station_type_id: ST.TESTING,    sequence: 30, status: true },

      // ── Line 7 — Rework ───────────────────────────────────────────────────
      { station_code: 'ST-RWK-DIAG',   name: 'Defect Diagnosis',         line_id: findLine(lines, 'ASSY-RWK'),  station_type_id: ST.INSPECTION, sequence: 10, status: true },
      { station_code: 'ST-RWK-REPAIR', name: 'Repair & Correction',      line_id: findLine(lines, 'ASSY-RWK'),  station_type_id: ST.ASSEMBLY,   sequence: 20, status: true },
      { station_code: 'ST-RWK-VERIFY', name: 'Rework Verification',      line_id: findLine(lines, 'ASSY-RWK'),  station_type_id: ST.INSPECTION, sequence: 30, status: true },

      // ── Line 8 — Painting Primer ──────────────────────────────────────────
      { station_code: 'ST-PRM-CLEAN',  name: 'Surface Cleaning',         line_id: findLine(lines, 'PAINT-PRM'), station_type_id: ST.PAINTING,   sequence: 10, status: true },
      { station_code: 'ST-PRM-SPRAY',  name: 'Primer Spray',             line_id: findLine(lines, 'PAINT-PRM'), station_type_id: ST.PAINTING,   sequence: 20, status: true },
      { station_code: 'ST-PRM-OVEN',   name: 'Oven Drying Primer',       line_id: findLine(lines, 'PAINT-PRM'), station_type_id: ST.OVEN,       sequence: 30, status: true },
      { station_code: 'ST-PRM-QC',     name: 'Primer Quality Check',     line_id: findLine(lines, 'PAINT-PRM'), station_type_id: ST.INSPECTION, sequence: 40, status: true },

      // ── Line 9 — Painting Color ───────────────────────────────────────────
      { station_code: 'ST-COL-SPRAY',  name: 'Color Spray',              line_id: findLine(lines, 'PAINT-COL'), station_type_id: ST.PAINTING,   sequence: 10, status: true },
      { station_code: 'ST-COL-OVEN',   name: 'Oven Drying Color',        line_id: findLine(lines, 'PAINT-COL'), station_type_id: ST.OVEN,       sequence: 20, status: true },
      { station_code: 'ST-COL-QC',     name: 'Color Defect Inspection',  line_id: findLine(lines, 'PAINT-COL'), station_type_id: ST.INSPECTION, sequence: 30, status: true },

      // ── Line 10 — Painting Color Coat ─────────────────────────────────────
      { station_code: 'ST-COAT-CLEAN', name: 'Surface Final Cleaning',      line_id: findLine(lines, 'PAINT-COAT'), station_type_id: ST.PAINTING,   sequence: 10, status: true },
      { station_code: 'ST-COAT-SPRAY', name: 'Color Coat Spray',            line_id: findLine(lines, 'PAINT-COAT'), station_type_id: ST.PAINTING,   sequence: 20, status: true },
      { station_code: 'ST-COAT-OVEN',  name: 'Oven Drying Color Coat',      line_id: findLine(lines, 'PAINT-COAT'), station_type_id: ST.OVEN,       sequence: 30, status: true },
      { station_code: 'ST-COAT-THK',   name: 'Color Coat Thickness Check',  line_id: findLine(lines, 'PAINT-COAT'), station_type_id: ST.INSPECTION, sequence: 40, status: true },
      { station_code: 'ST-COAT-VIS',   name: 'Color Coat Visual Inspection',line_id: findLine(lines, 'PAINT-COAT'), station_type_id: ST.INSPECTION, sequence: 50, status: true },

      // ── Line 11 — Incoming QC ─────────────────────────────────────────────
      { station_code: 'ST-INQC-RECV',  name: 'Goods Receiving Check',    line_id: findLine(lines, 'WH-INQC'),    station_type_id: ST.INSPECTION, sequence: 10, status: true },
      { station_code: 'ST-INQC-SAMP',  name: 'Sample Inspection',        line_id: findLine(lines, 'WH-INQC'),    station_type_id: ST.INSPECTION, sequence: 20, status: true },
      { station_code: 'ST-INQC-STCK',  name: 'Stock Putaway',            line_id: findLine(lines, 'WH-INQC'),    station_type_id: ST.ASSEMBLY,   sequence: 30, status: true },

      // ── Line 12 — Material Handling ───────────────────────────────────────
      { station_code: 'ST-MAT-PICK',   name: 'Material Picking',         line_id: findLine(lines, 'WH-MAT'),     station_type_id: ST.ASSEMBLY,   sequence: 10, status: true },
      { station_code: 'ST-MAT-PREP',   name: 'Material Preparation',     line_id: findLine(lines, 'WH-MAT'),     station_type_id: ST.ASSEMBLY,   sequence: 20, status: true },
      { station_code: 'ST-MAT-ISSUE',  name: 'Material Issuance',        line_id: findLine(lines, 'WH-MAT'),     station_type_id: ST.ASSEMBLY,   sequence: 30, status: true },
    ].map((s) => ({ ...s, ...ts }));

    await queryInterface.bulkInsert('s_stations', newStations, { ignoreDuplicates: true });

    // ── 2. Jobs ───────────────────────────────────────────────────────────────

    const [jobTypeRows] = await queryInterface.sequelize.query(`SELECT id, name FROM ref_job_types`);
    const jtMap = Object.fromEntries(jobTypeRows.map((r) => [r.name, r.id]));

    const newJobs = [
      // ── Battery Assembly jobs ─────────────────────────────────────────────
      { job_code: 'JOB-BATT-INSP',     name: 'Cell Visual Inspection',       job_type_id: jtMap['INSPECTION'], standard_time:  180 },
      { job_code: 'JOB-BATT-VOLT',     name: 'Cell Voltage Check',           job_type_id: jtMap['TESTING'],    standard_time:  120 },
      { job_code: 'JOB-BATT-BUILD',    name: 'Build Battery Pack',           job_type_id: jtMap['ASSEMBLY'],   standard_time:  600 },
      { job_code: 'JOB-BATT-WELD',     name: 'Spot Weld Cell Tabs',          job_type_id: jtMap['ASSEMBLY'],   standard_time:  480 },
      { job_code: 'JOB-BATT-CHG',      name: 'Initial Charge Cycle',         job_type_id: jtMap['TESTING'],    standard_time:  900 },
      { job_code: 'JOB-BATT-CAP',      name: 'Capacity Test',                job_type_id: jtMap['TESTING'],    standard_time:  480 },
      { job_code: 'JOB-BATT-FQC',      name: 'Battery Final QC Check',       job_type_id: jtMap['INSPECTION'], standard_time:  180 },

      // ── Charging & Testing jobs ───────────────────────────────────────────
      { job_code: 'JOB-TST-FULLCHG',   name: 'Full Charge Test',             job_type_id: jtMap['TESTING'],    standard_time:  720 },
      { job_code: 'JOB-TST-DISCHARGE', name: 'Discharge Test',               job_type_id: jtMap['TESTING'],    standard_time:  600 },
      { job_code: 'JOB-TST-ELEC-SF',   name: 'Electrical Safety Verify',     job_type_id: jtMap['TESTING'],    standard_time:  300 },
      { job_code: 'JOB-TST-SPEED',     name: 'Speed Performance Test',       job_type_id: jtMap['TESTING'],    standard_time:  480 },
      { job_code: 'JOB-TST-RANGE',     name: 'Range Estimation Test',        job_type_id: jtMap['TESTING'],    standard_time:  360 },

      // ── Rework jobs ───────────────────────────────────────────────────────
      { job_code: 'JOB-RWK-DIAG',      name: 'Defect Root Cause Analysis',   job_type_id: jtMap['INSPECTION'], standard_time:  300 },
      { job_code: 'JOB-RWK-ELEC',      name: 'Electrical Rework',            job_type_id: jtMap['ASSEMBLY'],   standard_time:  480 },
      { job_code: 'JOB-RWK-MECH',      name: 'Mechanical Rework',            job_type_id: jtMap['ASSEMBLY'],   standard_time:  360 },
      { job_code: 'JOB-RWK-VER',       name: 'Post-Rework Verification',     job_type_id: jtMap['INSPECTION'], standard_time:  240 },

      // ── Painting Primer jobs ──────────────────────────────────────────────
      { job_code: 'JOB-CLEAN-SURF',    name: 'Surface Cleaning & Degreasing',job_type_id: jtMap['PAINTING'],   standard_time:  300 },
      { job_code: 'JOB-SPRAY-PRM',     name: 'Primer Spray Application',     job_type_id: jtMap['PAINTING'],   standard_time:  360 },
      { job_code: 'JOB-OVEN-PRM',      name: 'Oven Drying Primer',           job_type_id: jtMap['OVEN'],       standard_time:  900 },
      { job_code: 'JOB-QC-PRM',        name: 'Primer Quality Check',         job_type_id: jtMap['INSPECTION'], standard_time:  180 },

      // ── Painting Color jobs ───────────────────────────────────────────────
      { job_code: 'JOB-SPRAY-COL',     name: 'Color Base Coat Spray',        job_type_id: jtMap['PAINTING'],   standard_time:  480 },
      { job_code: 'JOB-OVEN-COL',      name: 'Oven Drying Color Coat',       job_type_id: jtMap['OVEN'],       standard_time: 1200 },
      { job_code: 'JOB-QC-COL',        name: 'Color Defect Inspection',      job_type_id: jtMap['INSPECTION'], standard_time:  240 },

      // ── Painting Color Coat (clear coat / top coat) jobs ──────────────────
      { job_code: 'JOB-CLEAN-FNL',     name: 'Final Surface Cleaning',       job_type_id: jtMap['PAINTING'],   standard_time:  180 },
      { job_code: 'JOB-SPRAY-COAT',    name: 'Clear Coat Spray Application', job_type_id: jtMap['PAINTING'],   standard_time:  360 },
      { job_code: 'JOB-OVEN-COAT',     name: 'Oven Drying Clear Coat',       job_type_id: jtMap['OVEN'],       standard_time: 1080 },
      { job_code: 'JOB-INSP-THK',      name: 'Paint Thickness Measurement',  job_type_id: jtMap['INSPECTION'], standard_time:  180 },
      { job_code: 'JOB-INSP-VIS',      name: 'Visual Paint Inspection',      job_type_id: jtMap['INSPECTION'], standard_time:  180 },

      // ── Incoming QC jobs ──────────────────────────────────────────────────
      { job_code: 'JOB-INQC-COUNT',    name: 'Quantity Count Check',         job_type_id: jtMap['INSPECTION'], standard_time:  180 },
      { job_code: 'JOB-INQC-VIS',      name: 'Visual Damage Inspection',     job_type_id: jtMap['INSPECTION'], standard_time:  240 },
      { job_code: 'JOB-INQC-SAMP',     name: 'Random Sample Measurement',    job_type_id: jtMap['INSPECTION'], standard_time:  300 },
      { job_code: 'JOB-INQC-STORE',    name: 'Putaway to Storage Location',  job_type_id: jtMap['SYSTEM'],     standard_time:  180 },

      // ── Material Handling jobs ────────────────────────────────────────────
      { job_code: 'JOB-MAT-PICK',      name: 'Pick Material by BOM',         job_type_id: jtMap['SYSTEM'],     standard_time:  240 },
      { job_code: 'JOB-MAT-STAGE',     name: 'Stage Material to Line',       job_type_id: jtMap['ASSEMBLY'],   standard_time:  180 },
      { job_code: 'JOB-MAT-ISSUE',     name: 'Issue Material to Production', job_type_id: jtMap['SYSTEM'],     standard_time:  120 },
    ].map((j) => ({ ...j, active: true, ...ts }));

    await queryInterface.bulkInsert('s_jobs', newJobs, { ignoreDuplicates: true });

    // ── 3. Station Jobs ───────────────────────────────────────────────────────

    const allStations = await q(`SELECT id, station_code FROM s_stations WHERE deleted_at IS NULL`);
    const allJobs     = await q(`SELECT id, job_code FROM s_jobs WHERE deleted_at IS NULL`);

    const sj = (stCode, jobCode, seq, mandatory = true) => ({
      station_id: findStation(allStations, stCode),
      job_id:     findJob(allJobs, jobCode),
      sequence:   seq,
      mandatory,
      active:     true,
      ...ts,
    });

    const newStationJobs = [
      // Battery Assembly
      sj('ST-BATT-CELL',  'JOB-BATT-INSP',      1), sj('ST-BATT-CELL',  'JOB-BATT-VOLT',      2),
      sj('ST-BATT-ASSY',  'JOB-BATT-BUILD',     1), sj('ST-BATT-ASSY',  'JOB-BATT-WELD',      2),
      sj('ST-BATT-TEST',  'JOB-BATT-CHG',       1), sj('ST-BATT-TEST',  'JOB-BATT-CAP',       2),
      sj('ST-BATT-QC',    'JOB-BATT-FQC',       1),

      // Charging & Testing
      sj('ST-TST-CHG',    'JOB-TST-FULLCHG',    1), sj('ST-TST-CHG',    'JOB-TST-DISCHARGE',  2),
      sj('ST-TST-ELEC',   'JOB-TST-ELEC-SF',    1), sj('ST-TST-PERF',   'JOB-TST-SPEED',      1),
      sj('ST-TST-PERF',   'JOB-TST-RANGE',      2),

      // Rework
      sj('ST-RWK-DIAG',   'JOB-RWK-DIAG',       1), sj('ST-RWK-REPAIR', 'JOB-RWK-ELEC',       1),
      sj('ST-RWK-REPAIR', 'JOB-RWK-MECH',       2), sj('ST-RWK-VERIFY', 'JOB-RWK-VER',        1),

      // Painting Primer
      sj('ST-PRM-CLEAN',  'JOB-CLEAN-SURF',     1), sj('ST-PRM-SPRAY',  'JOB-SPRAY-PRM',      1),
      sj('ST-PRM-OVEN',   'JOB-OVEN-PRM',       1), sj('ST-PRM-QC',     'JOB-QC-PRM',         1),

      // Painting Color
      sj('ST-COL-SPRAY',  'JOB-SPRAY-COL',      1), sj('ST-COL-OVEN',   'JOB-OVEN-COL',       1),
      sj('ST-COL-QC',     'JOB-QC-COL',         1),

      // Painting Color Coat
      sj('ST-COAT-CLEAN', 'JOB-CLEAN-FNL',      1), sj('ST-COAT-SPRAY', 'JOB-SPRAY-COAT',     1),
      sj('ST-COAT-OVEN',  'JOB-OVEN-COAT',      1), sj('ST-COAT-THK',   'JOB-INSP-THK',       1),
      sj('ST-COAT-VIS',   'JOB-INSP-VIS',       1),

      // Incoming QC & Material Handling
      sj('ST-INQC-RECV',  'JOB-INQC-COUNT',     1), sj('ST-INQC-RECV',  'JOB-INQC-VIS',       2),
      sj('ST-INQC-SAMP',  'JOB-INQC-SAMP',      1), sj('ST-INQC-STCK',  'JOB-INQC-STORE',     1),
      sj('ST-MAT-PICK',   'JOB-MAT-PICK',       1), sj('ST-MAT-PREP',   'JOB-MAT-STAGE',      1),
      sj('ST-MAT-ISSUE',  'JOB-MAT-ISSUE',      1),
    ].filter((r) => r.station_id && r.job_id);

    await queryInterface.bulkInsert('s_station_jobs', newStationJobs, { ignoreDuplicates: true });

    // ── 5. FOREMAN role & users ───────────────────────────────────────────────

    await queryInterface.bulkInsert('s_roles', [
      { name: 'FOREMAN', division_id: null, status: true, ...ts },
    ], { ignoreDuplicates: true });

    const [[foremanRole]] = await queryInterface.sequelize.query(
      `SELECT id FROM s_roles WHERE name = 'FOREMAN' LIMIT 1`
    );

    const passwordHash = await bcrypt.hash('foreman123', 10);

    const lineConfigs = [
      { code: 'ASSY-FRM',   label: 'frm'  }, { code: 'ASSY-BATT',  label: 'batt' },
      { code: 'ASSY-ELEC',  label: 'elec' }, { code: 'ASSY-FNL',   label: 'fnl'  },
      { code: 'ASSY-TEST',  label: 'test' }, { code: 'ASSY-QC',    label: 'qc'   },
      { code: 'ASSY-RWK',   label: 'rwk'  }, { code: 'PAINT-PRM',  label: 'prm'  },
      { code: 'PAINT-COL',  label: 'col'  }, { code: 'PAINT-COAT', label: 'coat' },
      { code: 'WH-INQC',    label: 'inqc' }, { code: 'WH-MAT',     label: 'mat'  },
      { code: 'WH-PACK',    label: 'pack' }, { code: 'WH-FG',      label: 'fg'   },
    ];

    const foremanEmails = lineConfigs.map((l) => `foreman.${l.label}@factory.local`);
    const existingEmails = await q(`SELECT email FROM s_users WHERE email = ANY(ARRAY[${foremanEmails.map((e) => `'${e}'`).join(',')}])`);
    const existingSet = new Set(existingEmails.map((r) => r.email));

    const newForemen = foremanEmails
      .filter((email) => !existingSet.has(email))
      .map((email) => ({ email, password: passwordHash, role_id: foremanRole.id, active: true, ...ts }));

    if (newForemen.length > 0) {
      await queryInterface.bulkInsert('s_users', newForemen);
    }

    const foremanRows = await q(`SELECT id, email FROM s_users WHERE email = ANY(ARRAY[${foremanEmails.map((e) => `'${e}'`).join(',')}])`);
    const foremanMap = Object.fromEntries(foremanRows.map((r) => [r.email, r.id]));

    // ── 7. New Flow: Employees & Group Members ────────────────────────────────
    
    const employeesToInsert = [];

    lineConfigs.forEach((l) => {
      const lbl = l.label.toUpperCase();

      // Define personal data structure
      const squad = [
        { code: `EMP-${lbl}-001`, name: `Leader ${lbl}`,     position: 'Group Leader' },
        { code: `EMP-${lbl}-002`, name: `Operator A ${lbl}`, position: 'Operator' },
        { code: `EMP-${lbl}-003`, name: `Operator B ${lbl}`, position: 'Operator' },
        { code: `EMP-${lbl}-004`, name: `Operator C ${lbl}`, position: 'Operator' },
        { code: `EMP-${lbl}-005`, name: `Operator D ${lbl}`, position: 'Operator' },
        { code: `EMP-${lbl}-006`, name: `QC ${lbl}`,         position: 'Quality Check' },
        { code: `EMP-${lbl}-007`, name: `Tech ${lbl}`,       position: 'Technician' },
      ];

      squad.forEach((member) => {
        // 1. Prepare data for s_employees (dengan qr_token)
        employeesToInsert.push({
          employee_code: member.code,
          name:          member.name,
          position_name: member.position,
          qr_token:      `QR-${member.code}`,
          active:        true,
          ...ts
        });
      });
    });

    // Bulk Insert master data karyawan (s_employees)
    await queryInterface.bulkInsert('s_employees', employeesToInsert, { ignoreDuplicates: true });

    // ── Summary ───────────────────────────────────────────────────────────────

    const paintLines = ['PAINT-PRM', 'PAINT-COL', 'PAINT-COAT'];
    console.log(`[Seeder] All 14 lines now have stations, jobs, and station_jobs.`);
    console.log(`[Seeder] Refactored Employees inserted to s_employees and mapped to groups.`);
    console.log(`[Seeder] Painting lines (${paintLines.join(', ')}) have:`);
    console.log(`         PAINT-PRM  → bottleneck ST-PRM-OVEN  (JOB-OVEN-PRM  = 900s)`);
    console.log(`         PAINT-COL  → bottleneck ST-COL-OVEN  (JOB-OVEN-COL  = 1200s)`);
    console.log(`         PAINT-COAT → bottleneck ST-COAT-OVEN (JOB-OVEN-COAT = 1080s)`);
    console.log(`[Seeder] Re-run shift-calendars seeder to recalculate capacity params for painting lines.`);
  },

  async down(queryInterface) {
    // Remove in reverse FK order (Child -> Parent)

    // 3. Delete master karyawan (s_employees) yang di-generate seeder
    await queryInterface.sequelize.query(`
      DELETE FROM s_employees WHERE employee_code LIKE 'EMP-%'
    `);

    const labels = ['frm','batt','elec','fnl','test','qc','rwk','prm','col','coat','inqc','mat','pack','fg'];
    const emails = labels.map((l) => `'foreman.${l}@factory.local'`).join(',');
    await queryInterface.sequelize.query(
      `DELETE FROM s_users WHERE email IN (${emails})`
    );

    const allNewStationCodes = [
      'ST-BATT-CELL','ST-BATT-ASSY','ST-BATT-TEST','ST-BATT-QC',
      'ST-TST-CHG','ST-TST-ELEC','ST-TST-PERF',
      'ST-RWK-DIAG','ST-RWK-REPAIR','ST-RWK-VERIFY',
      'ST-PRM-CLEAN','ST-PRM-SPRAY','ST-PRM-OVEN','ST-PRM-QC',
      'ST-COL-SPRAY','ST-COL-OVEN','ST-COL-QC',
      'ST-COAT-CLEAN','ST-COAT-SPRAY','ST-COAT-OVEN','ST-COAT-THK','ST-COAT-VIS',
      'ST-INQC-RECV','ST-INQC-SAMP','ST-INQC-STCK',
      'ST-MAT-PICK','ST-MAT-PREP','ST-MAT-ISSUE',
    ].map((c) => `'${c}'`).join(',');

    await queryInterface.sequelize.query(
      `DELETE FROM s_station_jobs WHERE station_id IN (
        SELECT id FROM s_stations WHERE station_code IN (${allNewStationCodes})
      )`
    );

    await queryInterface.sequelize.query(
      `DELETE FROM s_stations WHERE station_code IN (${allNewStationCodes})`
    );

    const allNewJobCodes = [
      'JOB-BATT-INSP','JOB-BATT-VOLT','JOB-BATT-BUILD','JOB-BATT-WELD',
      'JOB-BATT-CHG','JOB-BATT-CAP','JOB-BATT-FQC',
      'JOB-TST-FULLCHG','JOB-TST-DISCHARGE','JOB-TST-ELEC-SF','JOB-TST-SPEED','JOB-TST-RANGE',
      'JOB-RWK-DIAG','JOB-RWK-ELEC','JOB-RWK-MECH','JOB-RWK-VER',
      'JOB-CLEAN-SURF','JOB-SPRAY-PRM','JOB-OVEN-PRM','JOB-QC-PRM',
      'JOB-SPRAY-COL','JOB-OVEN-COL','JOB-QC-COL',
      'JOB-CLEAN-FNL','JOB-SPRAY-COAT','JOB-OVEN-COAT','JOB-INSP-THK','JOB-INSP-VIS',
      'JOB-INQC-COUNT','JOB-INQC-VIS','JOB-INQC-SAMP','JOB-INQC-STORE',
      'JOB-MAT-PICK','JOB-MAT-STAGE','JOB-MAT-ISSUE',
    ].map((c) => `'${c}'`).join(',');

    await queryInterface.sequelize.query(
      `DELETE FROM s_jobs WHERE job_code IN (${allNewJobCodes})`
    );
  },
};