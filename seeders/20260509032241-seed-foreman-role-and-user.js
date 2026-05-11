import bcrypt from "bcryptjs";

export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // 1. Insert role FOREMAN
    await queryInterface.bulkInsert("s_roles", [
      {
        name: "FOREMAN",
        division_id: null,
        status: true,
        created_at: now,
        updated_at: now,
      },
    ]);

    // ambil role id
    const roles = await queryInterface.sequelize.query(
      `SELECT id FROM s_roles WHERE name = 'FOREMAN' LIMIT 1;`
    );

    const roleId = roles[0][0].id;

    // 2. Insert user foreman
    const passwordHash = await bcrypt.hash("foreman123", 10);

    await queryInterface.bulkInsert("s_users", [
      {
        email: "foreman@factory.local",
        password: passwordHash,
        role_id: roleId,
        active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("s_users", {
      email: "foreman@factory.local",
    });

    await queryInterface.bulkDelete("s_roles", {
      name: "FOREMAN",
    });
  },
};