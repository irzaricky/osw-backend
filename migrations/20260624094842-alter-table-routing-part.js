'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {

    // ── s_part_routing_details ────────────────────────────────────────────
    // Hapus kolom yang tidak dibutuhkan
    await queryInterface.removeColumn('s_part_routing_details', 'job_id');
    await queryInterface.removeColumn('s_part_routing_details', 'standard_time');
    await queryInterface.removeColumn('s_part_routing_details', 'setup_time');
    await queryInterface.removeColumn('s_part_routing_details', 'queue_time');
    await queryInterface.removeColumn('s_part_routing_details', 'move_time');
    await queryInterface.removeColumn('s_part_routing_details', 'manpower_required');

    // Unique constraint: satu station tidak boleh muncul dua kali per routing
    await queryInterface.addConstraint('s_part_routing_details', {
      fields: ['routing_id', 'station_id'],
      type:   'unique',
      name:   'uq_part_routing_details_routing_station'
    });

    // ── s_part_routing_detail_materials (tabel baru) ──────────────────────
    // Menggantikan s_routing_station_materials
    await queryInterface.createTable('s_part_routing_detail_materials', {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false
      },
      routing_detail_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: 's_part_routing_details', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'CASCADE'
      },
      part_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: 's_parts', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'RESTRICT'
      },
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('s_part_routing_detail_materials', ['routing_detail_id'], {
      name: 'idx_prdm_routing_detail_id'
    });
    await queryInterface.addIndex('s_part_routing_detail_materials', ['part_id'], {
      name: 'idx_prdm_part_id'
    });
    await queryInterface.addConstraint('s_part_routing_detail_materials', {
      fields: ['routing_detail_id', 'part_id'],
      type:   'unique',
      name:   'uq_prdm_routing_detail_part'
    });

    // ── Drop tabel lama ───────────────────────────────────────────────────
    await queryInterface.dropTable('s_routing_station_materials');
  },

  async down(queryInterface, Sequelize) {

    // Buat ulang s_routing_station_materials
    await queryInterface.createTable('s_routing_station_materials', {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false
      },
      routing_id: {
        type:      Sequelize.INTEGER,
        allowNull: false
      },
      station_id: {
        type:      Sequelize.INTEGER,
        allowNull: false
      },
      part_id: {
        type:      Sequelize.INTEGER,
        allowNull: false
      },
      qty_per_unit: {
        type:         Sequelize.DECIMAL(14, 4),
        allowNull:    false,
        defaultValue: 0.0000
      },
      uom: {
        type:      Sequelize.STRING(50),
        allowNull: true
      },
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type:      Sequelize.DATE,
        allowNull: true
      }
    });

    // Drop tabel baru
    await queryInterface.dropTable('s_part_routing_detail_materials');

    // Kembalikan kolom s_part_routing_details
    await queryInterface.removeConstraint(
      's_part_routing_details',
      'uq_part_routing_details_routing_station'
    );
    await queryInterface.addColumn('s_part_routing_details', 'job_id', {
      type:      Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('s_part_routing_details', 'standard_time', {
      type:         Sequelize.INTEGER,
      allowNull:    false,
      defaultValue: 0
    });
    await queryInterface.addColumn('s_part_routing_details', 'setup_time', {
      type:         Sequelize.INTEGER,
      allowNull:    false,
      defaultValue: 0
    });
    await queryInterface.addColumn('s_part_routing_details', 'queue_time', {
      type:         Sequelize.INTEGER,
      allowNull:    false,
      defaultValue: 0
    });
    await queryInterface.addColumn('s_part_routing_details', 'move_time', {
      type:         Sequelize.INTEGER,
      allowNull:    false,
      defaultValue: 0
    });
    await queryInterface.addColumn('s_part_routing_details', 'manpower_required', {
      type:         Sequelize.INTEGER,
      allowNull:    false,
      defaultValue: 1
    });
  }
};