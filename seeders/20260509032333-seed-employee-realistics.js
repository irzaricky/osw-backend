import bcrypt from "bcryptjs";

export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // ── 1. Ambil Data Lines ──────────────────────────────────────────────────
    const [lines] = await queryInterface.sequelize.query(`
      SELECT id, name FROM s_lines
      WHERE deleted_at IS NULL
      ORDER BY sequence ASC
      LIMIT 2;
    `);

    if (lines.length === 0) {
      throw new Error(
        "[Seeder] Tidak ada data s_lines. Jalankan seeder lines terlebih dahulu."
      );
    }

    const lineA = lines[0];
    const lineB = lines[1] ?? lines[0];

    // ── 2. Insert Posisi Karyawan (Group Leader DIHAPUS) ──────────────────────
    await queryInterface.bulkInsert("s_employee_positions", [
      { name: "Operator",      description: "Menjalankan proses produksi di stasiun kerja",  created_at: now, updated_at: now },
      { name: "Quality Check", description: "Memeriksa kualitas hasil produksi",             created_at: now, updated_at: now },
      { name: "Technician",    description: "Pemeliharaan dan perbaikan mesin produksi",     created_at: now, updated_at: now },
    ]);

    const [positions] = await queryInterface.sequelize.query(`
      SELECT id, name FROM s_employee_positions
      WHERE name IN ('Operator', 'Quality Check', 'Technician')
      ORDER BY id ASC;
    `);
    const posMap = Object.fromEntries(positions.map((p) => [p.name, p.id]));

    // ── 3. Insert Master Skill ────────────────────────────────────────────────
    await queryInterface.bulkInsert("s_skills", [
      { name: "Welding",          description: "Pengelasan komponen rangka dan bodi",          created_at: now, updated_at: now },
      { name: "Wiring",           description: "Pemasangan kabel dan sistem kelistrikan",      created_at: now, updated_at: now },
      { name: "Assembly",         description: "Perakitan komponen mekanik dan elektronik",    created_at: now, updated_at: now },
      { name: "Quality Inspect",  description: "Pemeriksaan visual dan pengujian fungsional",  created_at: now, updated_at: now },
      { name: "Machine Operate",  description: "Pengoperasian mesin produksi CNC/press",       created_at: now, updated_at: now },
      { name: "Forklift",         description: "Pengoperasian forklift dan material handling",  created_at: now, updated_at: now },
    ]);

    const [skills] = await queryInterface.sequelize.query(`
      SELECT id, name FROM s_skills
      WHERE name IN ('Welding','Wiring','Assembly','Quality Inspect','Machine Operate','Forklift')
      ORDER BY id ASC;
    `);
    const skillMap = Object.fromEntries(skills.map((s) => [s.name, s.id]));

    // ── 4. User Foreman (Sebagai Pemimpin Utama Group) ────────────────────────
    const [[foremanRole]] = await queryInterface.sequelize.query(`
      SELECT id FROM s_roles WHERE name = 'FOREMAN' LIMIT 1;
    `);

    const passwordHash = await bcrypt.hash("foreman123", 10);

    await queryInterface.bulkInsert("s_users", [
      { email: "foreman.lineA@factory.local", password: passwordHash, role_id: foremanRole.id, active: true, created_at: now, updated_at: now },
      { email: "foreman.lineB@factory.local", password: passwordHash, role_id: foremanRole.id, active: true, created_at: now, updated_at: now },
    ]);

    const [foremen] = await queryInterface.sequelize.query(`
      SELECT id, email FROM s_users
      WHERE email IN ('foreman.lineA@factory.local', 'foreman.lineB@factory.local')
      ORDER BY id ASC;
    `);

    const foremanA = foremen.find((u) => u.email === "foreman.lineA@factory.local");
    const foremanB = foremen.find((u) => u.email === "foreman.lineB@factory.local");

    // ── 5. Employee Groups ────────────────────────────────────────────────────
    await queryInterface.bulkInsert("s_employee_groups", [
      { line_id: lineA.id, name: `Group Alpha - ${lineA.name}`, leader_id: foremanA.id, description: "Group produksi utama untuk lini A", active: true, created_at: now, updated_at: now },
      { line_id: lineB.id, name: `Group Beta - ${lineB.name}`, leader_id: foremanB.id, description: "Group produksi lini B", active: true, created_at: now, updated_at: now },
    ]);

    const [groups] = await queryInterface.sequelize.query(`
      SELECT id, name FROM s_employee_groups
      WHERE name LIKE 'Group Alpha%' OR name LIKE 'Group Beta%'
      ORDER BY id ASC;
    `);

    const groupAlpha = groups.find((g) => g.name.startsWith("Group Alpha"));
    const groupBeta  = groups.find((g) => g.name.startsWith("Group Beta"));

    // ── 6. Insert Master Karyawan ke s_employees (Diubah ke Operator Senior) ──
    const rawEmployees = [
      // Karyawan Group Alpha (Budi Santoso sekarang menjadi Operator Senior)
      { employee_code: "EMP-A-001", name: "Budi Santoso",    position_id: posMap["Operator"],     qr_token: "tok_secure_19892_budi", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-A-002", name: "Agus Prasetyo",   position_id: posMap["Operator"],     qr_token: "tok_secure_19892_agus", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-A-003", name: "Siti Rahayu",     position_id: posMap["Operator"],     qr_token: "tok_secure_19892_siti", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-A-004", name: "Dwi Kurniawan",   position_id: posMap["Technician"],   qr_token: "tok_secure_19892_dwi", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-A-005", name: "Rina Wulandari",  position_id: posMap["Quality Check"], qr_token: "tok_secure_19892_rina", active: true, created_at: now, updated_at: now },
      // Karyawan Group Beta (Hendra Wijaya sekarang menjadi Operator Senior)
      { employee_code: "EMP-B-001", name: "Hendra Wijaya",   position_id: posMap["Operator"],     qr_token: "tok_secure_19892_hendra", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-B-002", name: "Fitri Handayani", position_id: posMap["Operator"],     qr_token: "tok_secure_19892_fitri", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-B-003", name: "Joko Susilo",     position_id: posMap["Operator"],     qr_token: "tok_secure_19892_joko", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-B-004", name: "Maya Sari",       position_id: posMap["Quality Check"], qr_token: "tok_secure_19892_maya", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-B-005", name: "Rudi Hartono",    position_id: posMap["Technician"],   qr_token: "tok_secure_19892_rudi", active: true, created_at: now, updated_at: now },
    ];

    await queryInterface.bulkInsert("s_employees", rawEmployees);

    const [employees] = await queryInterface.sequelize.query(`
      SELECT id, employee_code FROM s_employees
      WHERE employee_code LIKE 'EMP-%'
      ORDER BY id ASC;
    `);
    const empMap = Object.fromEntries(employees.map((e) => [e.employee_code, e.id]));

    // ── 7. Insert ke s_employee_group_members ────────────────────────────────
    await queryInterface.bulkInsert("s_employee_group_members", [
      // Members Group Alpha
      { group_id: groupAlpha.id, employee_id: empMap["EMP-A-001"], active: true, created_at: now, updated_at: now },
      { group_id: groupAlpha.id, employee_id: empMap["EMP-A-002"], active: true, created_at: now, updated_at: now },
      { group_id: groupAlpha.id, employee_id: empMap["EMP-A-003"], active: true, created_at: now, updated_at: now },
      { group_id: groupAlpha.id, employee_id: empMap["EMP-A-004"], active: true, created_at: now, updated_at: now },
      { group_id: groupAlpha.id, employee_id: empMap["EMP-A-005"], active: true, created_at: now, updated_at: now },
      // Members Group Beta
      { group_id: groupBeta.id,  employee_id: empMap["EMP-B-001"], active: true, created_at: now, updated_at: now },
      { group_id: groupBeta.id,  employee_id: empMap["EMP-B-002"], active: true, created_at: now, updated_at: now },
      { group_id: groupBeta.id,  employee_id: empMap["EMP-B-003"], active: true, created_at: now, updated_at: now },
      { group_id: groupBeta.id,  employee_id: empMap["EMP-B-004"], active: true, created_at: now, updated_at: now },
      { group_id: groupBeta.id,  employee_id: empMap["EMP-B-005"], active: true, created_at: now, updated_at: now },
    ]);

    // ── 8. Insert s_employee_skills ──────────────────────────────────────────
    await queryInterface.bulkInsert("s_employee_skills", [
      // Group Alpha (EMP-A-001 tetap memiliki level 5 karena dia Operator serbabisa)
      { employee_id: empMap["EMP-A-001"], skill_id: skillMap["Assembly"],        level: 5, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-A-001"], skill_id: skillMap["Welding"],         level: 4, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-A-002"], skill_id: skillMap["Welding"],         level: 3, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-A-002"], skill_id: skillMap["Machine Operate"],  level: 3, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-A-003"], skill_id: skillMap["Assembly"],         level: 2, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-A-003"], skill_id: skillMap["Welding"],         level: 2, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-A-004"], skill_id: skillMap["Machine Operate"],  level: 4, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-A-004"], skill_id: skillMap["Welding"],         level: 3, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-A-004"], skill_id: skillMap["Forklift"],         level: 2, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-A-005"], skill_id: skillMap["Quality Inspect"],  level: 3, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-A-005"], skill_id: skillMap["Assembly"],         level: 2, created_at: now, updated_at: now },
      // Group Beta
      { employee_id: empMap["EMP-B-001"], skill_id: skillMap["Wiring"],          level: 5, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-B-001"], skill_id: skillMap["Quality Inspect"],  level: 4, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-B-002"], skill_id: skillMap["Wiring"],          level: 3, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-B-002"], skill_id: skillMap["Assembly"],         level: 2, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-B-003"], skill_id: skillMap["Assembly"],         level: 2, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-B-003"], skill_id: skillMap["Forklift"],         level: 3, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-B-004"], skill_id: skillMap["Quality Inspect"],  level: 4, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-B-004"], skill_id: skillMap["Wiring"],          level: 2, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-B-005"], skill_id: skillMap["Machine Operate"],  level: 2, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-B-005"], skill_id: skillMap["Wiring"],          level: 2, created_at: now, updated_at: now },
      { employee_id: empMap["EMP-B-005"], skill_id: skillMap["Forklift"],         level: 3, created_at: now, updated_at: now },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("s_employee_skills", null, {});
    await queryInterface.bulkDelete("s_employee_group_members", null, {});
    await queryInterface.bulkDelete("s_employees", null, {});
    
    await queryInterface.sequelize.query(`
      DELETE FROM s_employee_groups WHERE name LIKE 'Group Alpha%' OR name LIKE 'Group Beta%';
    `);
    
    await queryInterface.bulkDelete("s_users", {
      email: ["foreman.lineA@factory.local", "foreman.lineB@factory.local"],
    });

    await queryInterface.bulkDelete("s_skills", null, {});
    await queryInterface.bulkDelete("s_employee_positions", {
      name: ["Operator", "Quality Check", "Technician"],
    });
  },
};