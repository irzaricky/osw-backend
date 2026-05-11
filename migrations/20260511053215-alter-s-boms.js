export default {
  async up(queryInterface, Sequelize) {
    // 1. Hapus kolom status (boolean) — diganti dengan doc_status_id dan activation_status_id
    await queryInterface.removeColumn('s_boms', 'status');

    // 2. Hapus kolom status_approval (varchar) — diganti dengan ref table FK
    await queryInterface.removeColumn('s_boms', 'status_approval');

    // 3. Tambah kolom-kolom baru
    await queryInterface.addColumn('s_boms', 'bom_version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });

    await queryInterface.addColumn('s_boms', 'uom_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_uoms',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('s_boms', 'doc_status_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'ref_bom_document_statuses',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('s_boms', 'activation_status_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'ref_bom_activation_statuses',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('s_boms', 'reject_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('s_boms', 'created_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      // Sesuaikan nama tabel users dengan project Anda
      references: {
        model: 's_users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('s_boms', 'approved_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('s_boms', 'approved_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('s_boms', 'activated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Catatan: partial unique index untuk BOM aktif per parent_part
    // dibuat di migration 08_create_bom_active_unique_index.js
    // karena harus jalan SETELAH seed ref_bom_activation_statuses (migration 07)
  },

  async down(queryInterface, Sequelize) {

    // Hapus kolom-kolom baru
    await queryInterface.removeColumn('s_boms', 'activated_at');
    await queryInterface.removeColumn('s_boms', 'approved_at');
    await queryInterface.removeColumn('s_boms', 'approved_by');
    await queryInterface.removeColumn('s_boms', 'created_by');
    await queryInterface.removeColumn('s_boms', 'reject_reason');
    await queryInterface.removeColumn('s_boms', 'activation_status_id');
    await queryInterface.removeColumn('s_boms', 'doc_status_id');
    await queryInterface.removeColumn('s_boms', 'uom_id');
    await queryInterface.removeColumn('s_boms', 'bom_version');

    // Kembalikan kolom lama
    await queryInterface.addColumn('s_boms', 'status_approval', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    await queryInterface.addColumn('s_boms', 'status', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: true,
    });
  },
};