export default {
  async up(queryInterface, Sequelize) {
    // 1. Hapus kolom child_bom_number (string) — diganti dengan child_bom_id (FK)
    await queryInterface.removeColumn('s_bom_details', 'child_bom_number');

    // 2. Tambah kolom-kolom baru
    await queryInterface.addColumn('s_bom_details', 'uom_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_uoms',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('s_bom_details', 'scrap_percentage', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('s_bom_details', 'sequence', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('s_bom_details', 'child_bom_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_boms',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // 3. Tambah constraint level 0–5
    await queryInterface.sequelize.query(`
      ALTER TABLE s_bom_details
      ADD CONSTRAINT chk_bom_detail_level CHECK (level IS NULL OR level BETWEEN 0 AND 5);
    `);

    // 4. Tambah constraint qty_required > 0
    await queryInterface.sequelize.query(`
      ALTER TABLE s_bom_details
      ADD CONSTRAINT chk_bom_detail_qty CHECK (qty_required > 0);
    `);
  },

  async down(queryInterface, Sequelize) {
    // Hapus constraints
    await queryInterface.sequelize.query(`
      ALTER TABLE s_bom_details DROP CONSTRAINT IF EXISTS chk_bom_detail_qty;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE s_bom_details DROP CONSTRAINT IF EXISTS chk_bom_detail_level;
    `);

    // Hapus kolom baru
    await queryInterface.removeColumn('s_bom_details', 'child_bom_id');
    await queryInterface.removeColumn('s_bom_details', 'sequence');
    await queryInterface.removeColumn('s_bom_details', 'scrap_percentage');
    await queryInterface.removeColumn('s_bom_details', 'uom_id');

    // Kembalikan kolom lama
    await queryInterface.addColumn('s_bom_details', 'child_bom_number', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },
};