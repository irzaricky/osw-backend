export default {
  async up(queryInterface, Sequelize) {
    // 1. Buat tabel induk master karyawan: s_employees
    await queryInterface.createTable(
      "s_employees",
      {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        employee_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        position_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "s_employee_positions", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        qr_token: {
          type: Sequelize.STRING(255),
          allowNull: false,
          unique: true // Harus unik untuk setiap karyawan
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
      },
    );

    // 2. Modifikasi s_employee_group_members agar merujuk ke s_employees
    // Hapus kolom personil yang duplikat
    await queryInterface.removeColumn("s_employee_group_members", "employee_code");
    await queryInterface.removeColumn("s_employee_group_members", "name");
    await queryInterface.removeColumn("s_employee_group_members", "position_id");
    await queryInterface.removeColumn("s_employee_group_members", "skill_level"); // pindah ke s_employee_skills atau s_employees jika general

    // Tambahkan foreign key employee_id
    await queryInterface.addColumn(
      "s_employee_group_members",
      "employee_id",
      {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "s_employees", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

    );

    // 3. Modifikasi s_employee_skills: ganti member_id menjadi employee_id agar skill melekat pada individu karyawan
    await queryInterface.removeColumn("s_employee_skills", "member_id");
    await queryInterface.addColumn("s_employee_skills", "employee_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: "s_employees", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('s_employee_skills', 'employee_id');
    await queryInterface.addColumn('s_employee_skills', 'member_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    // Revert s_employee_group_members
    await queryInterface.removeColumn('s_employee_group_members', 'employee_id');
    await queryInterface.addColumn('s_employee_group_members', 'employee_code', { type: Sequelize.STRING });
    await queryInterface.addColumn('s_employee_group_members', 'name', { type: Sequelize.STRING });
    await queryInterface.addColumn('s_employee_group_members', 'position_id', { type: Sequelize.INTEGER });
    await queryInterface.addColumn('s_employee_group_members', 'skill_level', { type: Sequelize.INTEGER });
    await queryInterface.dropTable("s_employees");
  },
};
