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

    // ── 6. Insert Master Karyawan ke s_employees (Diubah ke Operator Senior) ──
    const rawEmployees = [
      // Karyawan Group Alpha (Budi Santoso sekarang menjadi Operator Senior)
      { employee_code: "EMP-A-001", name: "Budi Santoso",    position_name: "Operator",     qr_token: "tok_secure_19892_budi", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-A-002", name: "Agus Prasetyo",   position_name: "Operator",     qr_token: "tok_secure_19892_agus", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-A-003", name: "Siti Rahayu",     position_name: "Operator",     qr_token: "tok_secure_19892_siti", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-A-004", name: "Dwi Kurniawan",   position_name: "Technician",   qr_token: "tok_secure_19892_dwi", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-A-005", name: "Rina Wulandari",  position_name: "Quality Check", qr_token: "tok_secure_19892_rina", active: true, created_at: now, updated_at: now },
      // Karyawan Group Beta (Hendra Wijaya sekarang menjadi Operator Senior)
      { employee_code: "EMP-B-001", name: "Hendra Wijaya",   position_name: "Operator",     qr_token: "tok_secure_19892_hendra", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-B-002", name: "Fitri Handayani", position_name: "Operator",     qr_token: "tok_secure_19892_fitri", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-B-003", name: "Joko Susilo",     position_name: "Operator",     qr_token: "tok_secure_19892_joko", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-B-004", name: "Maya Sari",       position_name: "Quality Check", qr_token: "tok_secure_19892_maya", active: true, created_at: now, updated_at: now },
      { employee_code: "EMP-B-005", name: "Rudi Hartono",    position_name: "Technician",   qr_token: "tok_secure_19892_rudi", active: true, created_at: now, updated_at: now },
    ];

    await queryInterface.bulkInsert("s_employees", rawEmployees);

    const [employees] = await queryInterface.sequelize.query(`
      SELECT id, employee_code FROM s_employees
      WHERE employee_code LIKE 'EMP-%'
      ORDER BY id ASC;
    `);
    const empMap = Object.fromEntries(employees.map((e) => [e.employee_code, e.id]));
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("s_employees", null, {});
    await queryInterface.bulkDelete("s_users", {
      email: ["foreman.lineA@factory.local", "foreman.lineB@factory.local"],
    });
  },
};