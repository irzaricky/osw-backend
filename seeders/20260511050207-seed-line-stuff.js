import bcrypt from "bcryptjs";

/**
 * Seeder: Complete line setup for production plan testing
 * Covers all 14 lines with stations, jobs, employee groups, and operators.
 *
 * Prerequisites:
 *   - s_factories, s_lines, ref_station_types seeded
 *   - s_jobs, ref_job_types seeded
 *   - s_roles with FOREMAN seeded
 *   - parts id 1-12 are product type
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

    const findLine    = (rows, code)   => rows.find((r) => r.line_code  === code)?.id;
    const findStation = (rows, code)   => rows.find((r) => r.station_code === code)?.id;
    const findJob     = (rows, code)   => rows.find((r) => r.job_code   === code)?.id;
    const findStType  = (rows, name)   => rows.find((r) => r.name       === name)?.id;

    // ── Fetch existing master data ────────────────────────────────────────────

    const lines      = await q(`SELECT id, line_code FROM s_lines WHERE deleted_at IS NULL`);
    const stTypes    = await q(`SELECT id, name FROM ref_station_types`);
    const existJobs  = await q(`SELECT id, job_code FROM s_jobs WHERE deleted_at IS NULL`);

    const ST = {
      INSPECTION: findStType(stTypes, 'INSPECTION'),
      ASSEMBLY:   findStType(stTypes, 'ASSEMBLY'),
      TESTING:    findStType(stTypes, 'TESTING'),
      PAINTING:   findStType(stTypes, 'PAINTING'),
      OVEN:       findStType(stTypes, 'OVEN'),
      PACKING:    findStType(stTypes, 'PACKING'),
    };

    // ── 1. Add stations for lines that don't have them yet ────────────────────
    // Lines 2, 5, 7, 11, 12 have no stations in previous seeder

    const newStations = [
      // Line 2 — Battery Assembly
      { station_code: 'ST-BATT-CELL',  name: 'Cell Incoming Inspection', line_id: findLine(lines, 'ASSY-BATT'), station_type_id: ST.INSPECTION, sequence: 10, status: true },
      { station_code: 'ST-BATT-ASSY',  name: 'Battery Pack Assembly',    line_id: findLine(lines, 'ASSY-BATT'), station_type_id: ST.ASSEMBLY,   sequence: 20, status: true },
      { station_code: 'ST-BATT-TEST',  name: 'Battery Charge Test',      line_id: findLine(lines, 'ASSY-BATT'), station_type_id: ST.TESTING,    sequence: 30, status: true },
      { station_code: 'ST-BATT-QC',    name: 'Battery Final QC',         line_id: findLine(lines, 'ASSY-BATT'), station_type_id: ST.INSPECTION, sequence: 40, status: true },

      // Line 5 — Charging & Testing
      { station_code: 'ST-TST-CHG',    name: 'Charging Station',         line_id: findLine(lines, 'ASSY-TEST'), station_type_id: ST.TESTING,    sequence: 10, status: true },
      { station_code: 'ST-TST-ELEC',   name: 'Electrical Safety Check',  line_id: findLine(lines, 'ASSY-TEST'), station_type_id: ST.TESTING,    sequence: 20, status: true },
      { station_code: 'ST-TST-PERF',   name: 'Performance Test',         line_id: findLine(lines, 'ASSY-TEST'), station_type_id: ST.TESTING,    sequence: 30, status: true },

      // Line 7 — Rework
      { station_code: 'ST-RWK-DIAG',   name: 'Defect Diagnosis',         line_id: findLine(lines, 'ASSY-RWK'),  station_type_id: ST.INSPECTION, sequence: 10, status: true },
      { station_code: 'ST-RWK-REPAIR', name: 'Repair & Correction',      line_id: findLine(lines, 'ASSY-RWK'),  station_type_id: ST.ASSEMBLY,   sequence: 20, status: true },
      { station_code: 'ST-RWK-VERIFY', name: 'Rework Verification',      line_id: findLine(lines, 'ASSY-RWK'),  station_type_id: ST.INSPECTION, sequence: 30, status: true },

      // Line 11 — Incoming QC
      { station_code: 'ST-INQC-RECV',  name: 'Goods Receiving Check',    line_id: findLine(lines, 'WH-INQC'),   station_type_id: ST.INSPECTION, sequence: 10, status: true },
      { station_code: 'ST-INQC-SAMP',  name: 'Sample Inspection',        line_id: findLine(lines, 'WH-INQC'),   station_type_id: ST.INSPECTION, sequence: 20, status: true },
      { station_code: 'ST-INQC-STCK',  name: 'Stock Putaway',            line_id: findLine(lines, 'WH-INQC'),   station_type_id: ST.ASSEMBLY,   sequence: 30, status: true },

      // Line 12 — Material Handling
      { station_code: 'ST-MAT-PICK',   name: 'Material Picking',         line_id: findLine(lines, 'WH-MAT'),    station_type_id: ST.ASSEMBLY,   sequence: 10, status: true },
      { station_code: 'ST-MAT-PREP',   name: 'Material Preparation',     line_id: findLine(lines, 'WH-MAT'),    station_type_id: ST.ASSEMBLY,   sequence: 20, status: true },
      { station_code: 'ST-MAT-ISSUE',  name: 'Material Issuance',        line_id: findLine(lines, 'WH-MAT'),    station_type_id: ST.ASSEMBLY,   sequence: 30, status: true },
    ].map((s) => ({ ...s, ...ts }));

    await queryInterface.bulkInsert('s_stations', newStations, { ignoreDuplicates: true });

    // ── 2. Add jobs for new stations ──────────────────────────────────────────

    const [jobTypeRows] = await queryInterface.sequelize.query(
      `SELECT id, name FROM ref_job_types`
    );
    const jtMap = Object.fromEntries(jobTypeRows.map((r) => [r.name, r.id]));

    const newJobs = [
      // Battery line jobs
      { job_code: 'JOB-BATT-INSP',   name: 'Cell Visual Inspection',      job_type_id: jtMap['INSPECTION'], standard_time: 180 },
      { job_code: 'JOB-BATT-VOLT',   name: 'Cell Voltage Check',          job_type_id: jtMap['TESTING'],    standard_time: 120 },
      { job_code: 'JOB-BATT-BUILD',  name: 'Build Battery Pack',          job_type_id: jtMap['ASSEMBLY'],   standard_time: 600 },
      { job_code: 'JOB-BATT-WELD',   name: 'Spot Weld Cell Tabs',         job_type_id: jtMap['ASSEMBLY'],   standard_time: 480 },
      { job_code: 'JOB-BATT-CHG',    name: 'Initial Charge Cycle',        job_type_id: jtMap['TESTING'],    standard_time: 900 },
      { job_code: 'JOB-BATT-CAP',    name: 'Capacity Test',               job_type_id: jtMap['TESTING'],    standard_time: 480 },
      { job_code: 'JOB-BATT-FQC',    name: 'Battery Final QC Check',      job_type_id: jtMap['INSPECTION'], standard_time: 180 },

      // Charging & Testing line jobs
      { job_code: 'JOB-TST-FULLCHG', name: 'Full Charge Test',            job_type_id: jtMap['TESTING'],    standard_time: 720 },
      { job_code: 'JOB-TST-DISCHARGE',name: 'Discharge Test',             job_type_id: jtMap['TESTING'],    standard_time: 600 },
      { job_code: 'JOB-TST-ELEC-SF', name: 'Electrical Safety Verify',   job_type_id: jtMap['TESTING'],    standard_time: 300 },
      { job_code: 'JOB-TST-SPEED',   name: 'Speed Performance Test',      job_type_id: jtMap['TESTING'],    standard_time: 480 },
      { job_code: 'JOB-TST-RANGE',   name: 'Range Estimation Test',       job_type_id: jtMap['TESTING'],    standard_time: 360 },

      // Rework line jobs
      { job_code: 'JOB-RWK-DIAG',    name: 'Defect Root Cause Analysis',  job_type_id: jtMap['INSPECTION'], standard_time: 300 },
      { job_code: 'JOB-RWK-ELEC',    name: 'Electrical Rework',           job_type_id: jtMap['ASSEMBLY'],   standard_time: 480 },
      { job_code: 'JOB-RWK-MECH',    name: 'Mechanical Rework',           job_type_id: jtMap['ASSEMBLY'],   standard_time: 360 },
      { job_code: 'JOB-RWK-VER',     name: 'Post-Rework Verification',    job_type_id: jtMap['INSPECTION'], standard_time: 240 },

      // Incoming QC line jobs
      { job_code: 'JOB-INQC-COUNT',  name: 'Quantity Count Check',        job_type_id: jtMap['INSPECTION'], standard_time: 180 },
      { job_code: 'JOB-INQC-VIS',    name: 'Visual Damage Inspection',    job_type_id: jtMap['INSPECTION'], standard_time: 240 },
      { job_code: 'JOB-INQC-SAMP',   name: 'Random Sample Measurement',  job_type_id: jtMap['INSPECTION'], standard_time: 300 },
      { job_code: 'JOB-INQC-STORE',  name: 'Putaway to Storage Location', job_type_id: jtMap['SYSTEM'],     standard_time: 180 },

      // Material Handling line jobs
      { job_code: 'JOB-MAT-PICK',    name: 'Pick Material by BOM',        job_type_id: jtMap['SYSTEM'],     standard_time: 240 },
      { job_code: 'JOB-MAT-STAGE',   name: 'Stage Material to Line',      job_type_id: jtMap['ASSEMBLY'],   standard_time: 180 },
      { job_code: 'JOB-MAT-ISSUE',   name: 'Issue Material to Production', job_type_id: jtMap['SYSTEM'],    standard_time: 120 },
    ].map((j) => ({ ...j, active: true, ...ts }));

    await queryInterface.bulkInsert('s_jobs', newJobs, { ignoreDuplicates: true });

    // ── 3. Assign jobs to new stations ────────────────────────────────────────

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
      sj('ST-BATT-CELL',  'JOB-BATT-INSP',    1),
      sj('ST-BATT-CELL',  'JOB-BATT-VOLT',    2),
      sj('ST-BATT-ASSY',  'JOB-BATT-BUILD',   1),
      sj('ST-BATT-ASSY',  'JOB-BATT-WELD',    2),
      sj('ST-BATT-TEST',  'JOB-BATT-CHG',     1),
      sj('ST-BATT-TEST',  'JOB-BATT-CAP',     2),
      sj('ST-BATT-QC',    'JOB-BATT-FQC',     1),

      // Charging & Testing
      sj('ST-TST-CHG',    'JOB-TST-FULLCHG',  1),
      sj('ST-TST-CHG',    'JOB-TST-DISCHARGE', 2),
      sj('ST-TST-ELEC',   'JOB-TST-ELEC-SF',  1),
      sj('ST-TST-PERF',   'JOB-TST-SPEED',    1),
      sj('ST-TST-PERF',   'JOB-TST-RANGE',    2),

      // Rework
      sj('ST-RWK-DIAG',   'JOB-RWK-DIAG',     1),
      sj('ST-RWK-REPAIR', 'JOB-RWK-ELEC',     1),
      sj('ST-RWK-REPAIR', 'JOB-RWK-MECH',     2),
      sj('ST-RWK-VERIFY', 'JOB-RWK-VER',      1),

      // Incoming QC
      sj('ST-INQC-RECV',  'JOB-INQC-COUNT',   1),
      sj('ST-INQC-RECV',  'JOB-INQC-VIS',     2),
      sj('ST-INQC-SAMP',  'JOB-INQC-SAMP',    1),
      sj('ST-INQC-STCK',  'JOB-INQC-STORE',   1),

      // Material Handling
      sj('ST-MAT-PICK',   'JOB-MAT-PICK',     1),
      sj('ST-MAT-PREP',   'JOB-MAT-STAGE',    1),
      sj('ST-MAT-ISSUE',  'JOB-MAT-ISSUE',    1),
    ].filter((r) => r.station_id && r.job_id); // skip if station/job not found

    await queryInterface.bulkInsert('s_station_jobs', newStationJobs, { ignoreDuplicates: true });

    // ── 4. Positions (skip if exists) ─────────────────────────────────────────

    await queryInterface.bulkInsert('s_employee_positions', [
      { name: 'Group Leader',  description: 'Leads and coordinates group members', ...ts },
      { name: 'Operator',      description: 'Runs production process at workstations', ...ts },
      { name: 'Quality Check', description: 'Inspects production output quality', ...ts },
      { name: 'Technician',    description: 'Maintains and repairs production machinery', ...ts },
    ], { ignoreDuplicates: true });

    const positions = await q(
      `SELECT id, name FROM s_employee_positions
       WHERE name IN ('Group Leader','Operator','Quality Check','Technician')`
    );
    const posMap = Object.fromEntries(positions.map((p) => [p.name, p.id]));

    // ── 5. FOREMAN role & users (one per line) ────────────────────────────────

    await queryInterface.bulkInsert('s_roles', [
      { name: 'FOREMAN', division_id: null, status: true, ...ts },
    ], { ignoreDuplicates: true });

    const [[foremanRole]] = await queryInterface.sequelize.query(
      `SELECT id FROM s_roles WHERE name = 'FOREMAN' LIMIT 1`
    );

    const passwordHash = await bcrypt.hash('foreman123', 10);

    // One foreman per line (14 lines total)
    const lineConfigs = [
      { code: 'ASSY-FRM',  label: 'frm'  },
      { code: 'ASSY-BATT', label: 'batt' },
      { code: 'ASSY-ELEC', label: 'elec' },
      { code: 'ASSY-FNL',  label: 'fnl'  },
      { code: 'ASSY-TEST', label: 'test' },
      { code: 'ASSY-QC',   label: 'qc'   },
      { code: 'ASSY-RWK',  label: 'rwk'  },
      { code: 'PAINT-PRM', label: 'prm'  },
      { code: 'PAINT-COL', label: 'col'  },
      { code: 'PAINT-COAT',label: 'coat' },
      { code: 'WH-INQC',   label: 'inqc' },
      { code: 'WH-MAT',    label: 'mat'  },
      { code: 'WH-PACK',   label: 'pack' },
      { code: 'WH-FG',     label: 'fg'   },
    ];

    const foremanEmails = lineConfigs.map((l) => `foreman.${l.label}@factory.local`);

    // Insert only foremen that don't exist yet
    const existingEmails = await q(
      `SELECT email FROM s_users WHERE email = ANY(ARRAY[${foremanEmails.map((e) => `'${e}'`).join(',')}])`
    );
    const existingSet = new Set(existingEmails.map((r) => r.email));

    const newForemen = foremanEmails
      .filter((email) => !existingSet.has(email))
      .map((email) => ({
        email,
        password:   passwordHash,
        role_id:    foremanRole.id,
        active:     true,
        ...ts,
      }));

    if (newForemen.length > 0) {
      await queryInterface.bulkInsert('s_users', newForemen);
    }

    const foremanRows = await q(
      `SELECT id, email FROM s_users WHERE email = ANY(ARRAY[${foremanEmails.map((e) => `'${e}'`).join(',')}])`
    );
    const foremanMap = Object.fromEntries(foremanRows.map((r) => [r.email, r.id]));

    // ── 6. Employee Groups — one per line ─────────────────────────────────────

    const groupsToInsert = lineConfigs
      .map((l) => ({
        line_id:     findLine(lines, l.code),
        name:        `Group ${l.label.toUpperCase()}`,
        leader_id:   foremanMap[`foreman.${l.label}@factory.local`],
        description: `Production group for ${l.code}`,
        active:      true,
        ...ts,
      }))
      .filter((g) => g.line_id && g.leader_id);

    await queryInterface.bulkInsert('s_employee_groups', groupsToInsert, { ignoreDuplicates: true });

    const groupRows = await q(
      `SELECT id, name FROM s_employee_groups
       WHERE name = ANY(ARRAY[${groupsToInsert.map((g) => `'${g.name}'`).join(',')}])`
    );
    const groupMap = Object.fromEntries(groupRows.map((g) => [g.name, g.id]));

    // ── 7. Members — 1 Group Leader + 4 Operators + 1 QC + 1 Technician each ─

    const membersToInsert = [];

    lineConfigs.forEach((l, li) => {
      const groupName = `Group ${l.label.toUpperCase()}`;
      const groupId   = groupMap[groupName];
      if (!groupId) return;

      const base = li * 7 + 1; // unique employee numbers per group

      membersToInsert.push(
        // Group Leader (= foreman, no separate member entry needed for ops count,
        //  but kept for org chart completeness)
        { group_id: groupId, employee_code: `EMP-${l.label.toUpperCase()}-001`, name: `Leader ${l.label.toUpperCase()}`,   position_id: posMap['Group Leader'],  skill_level: 4, active: true, ...ts },
        // Operators
        { group_id: groupId, employee_code: `EMP-${l.label.toUpperCase()}-002`, name: `Operator A ${l.label.toUpperCase()}`, position_id: posMap['Operator'],      skill_level: 3, active: true, ...ts },
        { group_id: groupId, employee_code: `EMP-${l.label.toUpperCase()}-003`, name: `Operator B ${l.label.toUpperCase()}`, position_id: posMap['Operator'],      skill_level: 3, active: true, ...ts },
        { group_id: groupId, employee_code: `EMP-${l.label.toUpperCase()}-004`, name: `Operator C ${l.label.toUpperCase()}`, position_id: posMap['Operator'],      skill_level: 2, active: true, ...ts },
        { group_id: groupId, employee_code: `EMP-${l.label.toUpperCase()}-005`, name: `Operator D ${l.label.toUpperCase()}`, position_id: posMap['Operator'],      skill_level: 2, active: true, ...ts },
        // QC
        { group_id: groupId, employee_code: `EMP-${l.label.toUpperCase()}-006`, name: `QC ${l.label.toUpperCase()}`,        position_id: posMap['Quality Check'], skill_level: 3, active: true, ...ts },
        // Technician
        { group_id: groupId, employee_code: `EMP-${l.label.toUpperCase()}-007`, name: `Tech ${l.label.toUpperCase()}`,      position_id: posMap['Technician'],    skill_level: 3, active: true, ...ts },
      );
    });

    await queryInterface.bulkInsert('s_employee_group_members', membersToInsert, { ignoreDuplicates: true });

    // ── 8. Delivery Orders — spread across parts 1-12 ─────────────────────────
    // Assumes delivery_plans, spo_details exist (from previous seeder)
    // We add 4 more DOs with varied parts to support multi-line plan testing

    const existingDOs = await q(`SELECT COUNT(*) as cnt FROM s_delivery_orders`);
    const doCount     = parseInt(existingDOs[0].cnt);

    if (doCount < 6) {
      // Only insert if not enough DOs for testing
      console.log('[Seeder] Skipping DO insert — run delivery order seeder first');
    }

    // ── 9. Line Capacity Params — pre-populate for all lines ─────────────────
    // Computed from station/job data above. Max takt time is set conservatively.
    // Users can recalculate from the UI after this seeder runs.

    const lineCapacityDefaults = [
      { code: 'ASSY-FRM',   working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 4, max_takt: 660  }, // bottleneck: Frame Alignment (300+360)
      { code: 'ASSY-BATT',  working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 4, max_takt: 1080 }, // bottleneck: Battery Charge Test (900+180 → CHG station)
      { code: 'ASSY-ELEC',  working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 4, max_takt: 840  }, // bottleneck: Motor Install (420+120)
      { code: 'ASSY-FNL',   working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 4, max_takt: 540  }, // bottleneck: Brake Assembly (240+180+120)
      { code: 'ASSY-TEST',  working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 3, max_takt: 1320 }, // bottleneck: Charging (720+600)
      { code: 'ASSY-QC',    working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 3, max_takt: 780  }, // bottleneck: Road Test (480+300)
      { code: 'ASSY-RWK',   working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 3, max_takt: 840  }, // bottleneck: Repair (480+360)
      { code: 'PAINT-PRM',  working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 3, max_takt: 900  }, // bottleneck: Oven Primer
      { code: 'PAINT-COL',  working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 3, max_takt: 1200 }, // bottleneck: Oven Color
      { code: 'PAINT-COAT', working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 3, max_takt: 1080 }, // bottleneck: Oven Coat
      { code: 'WH-INQC',    working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 4, max_takt: 420  }, // bottleneck: Sample Inspection (300+120)
      { code: 'WH-MAT',     working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 4, max_takt: 420  }, // bottleneck: Material Picking (240+180)
      { code: 'WH-PACK',    working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 4, max_takt: 600  }, // bottleneck: Packing Process (240+360)
      { code: 'WH-FG',      working_days: 22, shifts: 1, hrs: 7, efficiency: 0.85, overtime: 0, manpower: 2, max_takt: 180  }, // bottleneck: FG Transfer (120+60)
    ];

    const capacityRows = lineCapacityDefaults
      .map((lc) => ({
        line_id:                         findLine(lines, lc.code),
        default_working_days:            lc.working_days,
        default_shifts_per_day:          lc.shifts,
        default_working_hours_per_shift: lc.hrs,
        default_efficiency_factor:       lc.efficiency,
        default_overtime_hours:          lc.overtime,
        default_manpower:                lc.manpower,
        default_max_takt_time:           lc.max_takt,
        ...ts,
      }))
      .filter((r) => r.line_id);

    // Upsert — skip lines that already have params
    for (const row of capacityRows) {
      const existing = await q(
        `SELECT id FROM s_line_capacity_params WHERE line_id = ${row.line_id}`
      );
      if (existing.length === 0) {
        await queryInterface.bulkInsert('s_line_capacity_params', [row]);
      }
    }

    console.log('[Seeder] All 14 lines now have stations, jobs, employee groups, and capacity params.');
  },

  async down(queryInterface) {
    // Remove in reverse FK order

    await queryInterface.sequelize.query(`
      DELETE FROM s_line_capacity_params
      WHERE line_id IN (SELECT id FROM s_lines WHERE line_code IN (
        'ASSY-FRM','ASSY-BATT','ASSY-ELEC','ASSY-FNL','ASSY-TEST',
        'ASSY-QC','ASSY-RWK','PAINT-PRM','PAINT-COL','PAINT-COAT',
        'WH-INQC','WH-MAT','WH-PACK','WH-FG'
      ))
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM s_employee_skills
      WHERE member_id IN (
        SELECT m.id FROM s_employee_group_members m
        JOIN s_employee_groups g ON m.group_id = g.id
        WHERE g.name LIKE 'Group %'
      )
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM s_employee_group_members
      WHERE group_id IN (SELECT id FROM s_employee_groups WHERE name LIKE 'Group %')
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM s_employee_groups WHERE name LIKE 'Group %'
    `);

    const labels = ['frm','batt','elec','fnl','test','qc','rwk','prm','col','coat','inqc','mat','pack','fg'];
    const emails = labels.map((l) => `'foreman.${l}@factory.local'`).join(',');
    await queryInterface.sequelize.query(
      `DELETE FROM s_users WHERE email IN (${emails})`
    );

    await queryInterface.sequelize.query(`
      DELETE FROM s_station_jobs WHERE station_id IN (
        SELECT id FROM s_stations WHERE station_code IN (
          'ST-BATT-CELL','ST-BATT-ASSY','ST-BATT-TEST','ST-BATT-QC',
          'ST-TST-CHG','ST-TST-ELEC','ST-TST-PERF',
          'ST-RWK-DIAG','ST-RWK-REPAIR','ST-RWK-VERIFY',
          'ST-INQC-RECV','ST-INQC-SAMP','ST-INQC-STCK',
          'ST-MAT-PICK','ST-MAT-PREP','ST-MAT-ISSUE'
        )
      )
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM s_stations WHERE station_code IN (
        'ST-BATT-CELL','ST-BATT-ASSY','ST-BATT-TEST','ST-BATT-QC',
        'ST-TST-CHG','ST-TST-ELEC','ST-TST-PERF',
        'ST-RWK-DIAG','ST-RWK-REPAIR','ST-RWK-VERIFY',
        'ST-INQC-RECV','ST-INQC-SAMP','ST-INQC-STCK',
        'ST-MAT-PICK','ST-MAT-PREP','ST-MAT-ISSUE'
      )
    `);
  },
};