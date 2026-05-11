// Jalankan SETELAH migration 02_create_s_uoms.js dan seed UOM sudah ada

export default {
  async up(queryInterface, Sequelize) {
    // 1. Tambah uom_id sebagai FK ke s_uoms
    await queryInterface.addColumn('s_parts', 'uom_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_uoms',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // 2. Migrasi data: isi uom_id berdasarkan nilai string uom yang ada
    await queryInterface.sequelize.query(`
      UPDATE s_parts sp
      SET uom_id = u.id
      FROM s_uoms u
      WHERE UPPER(sp.uom) = UPPER(u.code)
        AND sp.uom IS NOT NULL;
    `);

    // 3. Drop kolom uom varchar lama
    await queryInterface.removeColumn('s_parts', 'uom');
  },

  async down(queryInterface, Sequelize) {
    // Kembalikan kolom uom varchar
    await queryInterface.addColumn('s_parts', 'uom', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });

    // Restore nilai string dari s_uoms
    await queryInterface.sequelize.query(`
      UPDATE s_parts sp
      SET uom = u.code
      FROM s_uoms u
      WHERE sp.uom_id = u.id;
    `);

    await queryInterface.removeColumn('s_parts', 'uom_id');
  },
};