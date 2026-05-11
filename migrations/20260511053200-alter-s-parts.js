export default {
  async up(queryInterface, Sequelize) {
    // 1. Hapus kolom package_name dan package_code (redundan, sudah ada package_id FK ke s_packages)
    await queryInterface.removeColumn('s_parts', 'package_name');
    await queryInterface.removeColumn('s_parts', 'package_code');

    // 2. Hapus kolom part_category (varchar lama, jika ada)
    //    Lalu tambah part_category_id (int) sebagai FK ke ref_part_categories
    //    Catatan: kolom lama di DB awal bernama 'part_category' (varchar), bukan 'part_category_id'
    await queryInterface.removeColumn('s_parts', 'part_category');

    await queryInterface.addColumn('s_parts', 'part_category_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'ref_part_categories',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface, Sequelize) {
    // Rollback: kembalikan kolom lama
    await queryInterface.removeColumn('s_parts', 'part_category_id');

    await queryInterface.addColumn('s_parts', 'part_category', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    await queryInterface.addColumn('s_parts', 'package_code', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    await queryInterface.addColumn('s_parts', 'package_name', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },
};