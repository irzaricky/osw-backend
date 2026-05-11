import bcrypt from "bcryptjs";

export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

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


    await queryInterface.bulkInsert("s_employee_positions", [
      { name: "Group Leader",  description: "Memimpin dan mengkoordinasi anggota group", created_at: now, updated_at: now },
      { name: "Operator",      description: "Menjalankan proses produksi di stasiun kerja",  created_at: now, updated_at: now },
      { name: "Quality Check", description: "Memeriksa kualitas hasil produksi",             created_at: now, updated_at: now },
      { name: "Technician",    description: "Pemeliharaan dan perbaikan mesin produksi",     created_at: now, updated_at: now },
    ]);

    const [positions] = await queryInterface.sequelize.query(`
      SELECT id, name FROM s_employee_positions
      WHERE name IN ('Group Leader', 'Operator', 'Quality Check', 'Technician')
      ORDER BY id ASC;
    `);

    const posMap = Object.fromEntries(positions.map((p) => [p.name, p.id]));

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

    const [[foremanRole]] = await queryInterface.sequelize.query(`
      SELECT id FROM s_roles WHERE name = 'FOREMAN' LIMIT 1;
    `);


    // ── 4. User Foreman
    const passwordHash = await bcrypt.hash("foreman123", 10);

    await queryInterface.bulkInsert("s_users", [
      {
        email:      "foreman.lineA@factory.local",
        password:   passwordHash,
        role_id:    foremanRole.id,
        active:     true,
        created_at: now,
        updated_at: now,
      },
      {
        email:      "foreman.lineB@factory.local",
        password:   passwordHash,
        role_id:    foremanRole.id,
        active:     true,
        created_at: now,
        updated_at: now,
      },
    ]);

    const [foremen] = await queryInterface.sequelize.query(`
      SELECT id, email FROM s_users
      WHERE email IN ('foreman.lineA@factory.local', 'foreman.lineB@factory.local')
      ORDER BY id ASC;
    `);

    const foremanA = foremen.find((u) => u.email === "foreman.lineA@factory.local");
    const foremanB = foremen.find((u) => u.email === "foreman.lineB@factory.local");


    // ── 5. Employee Groups
    await queryInterface.bulkInsert("s_employee_groups", [
      {
        line_id:     lineA.id,
        name:        `Group Alpha - ${lineA.name}`,
        leader_id:   foremanA.id,
        description: "Group produksi utama untuk lini A, fokus pada proses assembly dan welding",
        active:      true,
        created_at:  now,
        updated_at:  now,
      },
      {
        line_id:     lineB.id,
        name:        `Group Beta - ${lineB.name}`,
        leader_id:   foremanB.id,
        description: "Group produksi lini B, menangani wiring, quality check, dan finishing",
        active:      true,
        created_at:  now,
        updated_at:  now,
      },
    ]);

    const [groups] = await queryInterface.sequelize.query(`
      SELECT id, name FROM s_employee_groups
      WHERE name LIKE 'Group Alpha%' OR name LIKE 'Group Beta%'
      ORDER BY id ASC;
    `);

    const groupAlpha = groups.find((g) => g.name.startsWith("Group Alpha"));
    const groupBeta  = groups.find((g) => g.name.startsWith("Group Beta"));


    // ── 6. Members Group Alpha
    await queryInterface.bulkInsert("s_employee_group_members", [
      {
        group_id:      groupAlpha.id,
        employee_code: "EMP-A-001",
        name:          "Budi Santoso",
        position_id:   posMap["Group Leader"],
        skill_level:   4,
        active:        true,
        created_at:    now,
        updated_at:    now,
      },
      {
        group_id:      groupAlpha.id,
        employee_code: "EMP-A-002",
        name:          "Agus Prasetyo",
        position_id:   posMap["Operator"],
        skill_level:   3,
        active:        true,
        created_at:    now,
        updated_at:    now,
      },
      {
        group_id:      groupAlpha.id,
        employee_code: "EMP-A-003",
        name:          "Siti Rahayu",
        position_id:   posMap["Operator"],
        skill_level:   2,
        active:        true,
        created_at:    now,
        updated_at:    now,
      },
      {
        group_id:      groupAlpha.id,
        employee_code: "EMP-A-004",
        name:          "Dwi Kurniawan",
        position_id:   posMap["Technician"],
        skill_level:   3,
        active:        true,
        created_at:    now,
        updated_at:    now,
      },
      {
        group_id:      groupAlpha.id,
        employee_code: "EMP-A-005",
        name:          "Rina Wulandari",
        position_id:   posMap["Quality Check"],
        skill_level:   3,
        active:        true,
        created_at:    now,
        updated_at:    now,
      },
    ]);

    // ── 7. Members Group Beta
    await queryInterface.bulkInsert("s_employee_group_members", [
      {
        group_id:      groupBeta.id,
        employee_code: "EMP-B-001",
        name:          "Hendra Wijaya",
        position_id:   posMap["Group Leader"],
        skill_level:   4,
        active:        true,
        created_at:    now,
        updated_at:    now,
      },
      {
        group_id:      groupBeta.id,
        employee_code: "EMP-B-002",
        name:          "Fitri Handayani",
        position_id:   posMap["Operator"],
        skill_level:   3,
        active:        true,
        created_at:    now,
        updated_at:    now,
      },
      {
        group_id:      groupBeta.id,
        employee_code: "EMP-B-003",
        name:          "Joko Susilo",
        position_id:   posMap["Operator"],
        skill_level:   2,
        active:        true,
        created_at:    now,
        updated_at:    now,
      },
      {
        group_id:      groupBeta.id,
        employee_code: "EMP-B-004",
        name:          "Maya Sari",
        position_id:   posMap["Quality Check"],
        skill_level:   4,
        active:        true,
        created_at:    now,
        updated_at:    now,
      },
      {
        group_id:      groupBeta.id,
        employee_code: "EMP-B-005",
        name:          "Rudi Hartono",
        position_id:   posMap["Technician"],
        skill_level:   2,
        active:        true,
        created_at:    now,
        updated_at:    now,
      },
    ]);

    // ── Ambil semua member yang baru diinsert 
    const [members] = await queryInterface.sequelize.query(`
      SELECT id, employee_code FROM s_employee_group_members
      WHERE employee_code IN (
        'EMP-A-001','EMP-A-002','EMP-A-003','EMP-A-004','EMP-A-005',
        'EMP-B-001','EMP-B-002','EMP-B-003','EMP-B-004','EMP-B-005'
      )
      ORDER BY id ASC;
    `);

    const memberMap = Object.fromEntries(members.map((m) => [m.employee_code, m.id]));


    // ── 8. Employee Skills ────────────────────────────────────────────────────
    // level: 1 = Pemula, 2 = Dasar, 3 = Terampil, 4 = Ahli, 5 = Master
    await queryInterface.bulkInsert("s_employee_skills", [
      // Group Alpha
      { member_id: memberMap["EMP-A-001"], skill_id: skillMap["Assembly"],        level: 5, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-A-001"], skill_id: skillMap["Welding"],          level: 4, created_at: now, updated_at: now },

      { member_id: memberMap["EMP-A-002"], skill_id: skillMap["Welding"],          level: 3, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-A-002"], skill_id: skillMap["Machine Operate"],  level: 3, created_at: now, updated_at: now },

      { member_id: memberMap["EMP-A-003"], skill_id: skillMap["Assembly"],         level: 2, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-A-003"], skill_id: skillMap["Welding"],          level: 2, created_at: now, updated_at: now },

      { member_id: memberMap["EMP-A-004"], skill_id: skillMap["Machine Operate"],  level: 4, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-A-004"], skill_id: skillMap["Welding"],          level: 3, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-A-004"], skill_id: skillMap["Forklift"],         level: 2, created_at: now, updated_at: now },

      { member_id: memberMap["EMP-A-005"], skill_id: skillMap["Quality Inspect"],  level: 3, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-A-005"], skill_id: skillMap["Assembly"],         level: 2, created_at: now, updated_at: now },

      // Group Beta
      { member_id: memberMap["EMP-B-001"], skill_id: skillMap["Wiring"],           level: 5, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-B-001"], skill_id: skillMap["Quality Inspect"],  level: 4, created_at: now, updated_at: now },

      { member_id: memberMap["EMP-B-002"], skill_id: skillMap["Wiring"],           level: 3, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-B-002"], skill_id: skillMap["Assembly"],         level: 2, created_at: now, updated_at: now },

      { member_id: memberMap["EMP-B-003"], skill_id: skillMap["Assembly"],         level: 2, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-B-003"], skill_id: skillMap["Forklift"],         level: 3, created_at: now, updated_at: now },

      { member_id: memberMap["EMP-B-004"], skill_id: skillMap["Quality Inspect"],  level: 4, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-B-004"], skill_id: skillMap["Wiring"],           level: 2, created_at: now, updated_at: now },

      { member_id: memberMap["EMP-B-005"], skill_id: skillMap["Machine Operate"],  level: 2, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-B-005"], skill_id: skillMap["Wiring"],           level: 2, created_at: now, updated_at: now },
      { member_id: memberMap["EMP-B-005"], skill_id: skillMap["Forklift"],         level: 3, created_at: now, updated_at: now },
    ]);
  },


  async down(queryInterface) {
    // Urutan delete: child → parent untuk menghindari FK violation

    await queryInterface.bulkDelete("s_employee_skills", {
      // Hapus semua skill milik member yang kita insert
    });

    await queryInterface.sequelize.query(`
      DELETE FROM s_employee_skills
      WHERE member_id IN (
        SELECT id FROM s_employee_group_members
        WHERE employee_code IN (
          'EMP-A-001','EMP-A-002','EMP-A-003','EMP-A-004','EMP-A-005',
          'EMP-B-001','EMP-B-002','EMP-B-003','EMP-B-004','EMP-B-005'
        )
      );
    `);

    await queryInterface.bulkDelete("s_employee_group_members", {
      employee_code: [
        "EMP-A-001", "EMP-A-002", "EMP-A-003", "EMP-A-004", "EMP-A-005",
        "EMP-B-001", "EMP-B-002", "EMP-B-003", "EMP-B-004", "EMP-B-005",
      ],
    });

    await queryInterface.sequelize.query(`
      DELETE FROM s_employee_groups
      WHERE name LIKE 'Group Alpha%' OR name LIKE 'Group Beta%';
    `);

    await queryInterface.bulkDelete("s_users", {
      email: [
        "foreman.lineA@factory.local",
        "foreman.lineB@factory.local",
      ],
    });

    await queryInterface.bulkDelete("s_roles", { name: "FOREMAN" });

    await queryInterface.bulkDelete("s_skills", {
      name: ["Welding", "Wiring", "Assembly", "Quality Inspect", "Machine Operate", "Forklift"],
    });

    await queryInterface.bulkDelete("s_employee_positions", {
      name: ["Group Leader", "Operator", "Quality Check", "Technician"],
    });
  },
};