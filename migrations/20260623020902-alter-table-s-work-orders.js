'use strict';

/**
 * Migration: Update Work Order Schema
 *
 * Perubahan yang dilakukan:
 * 1. s_work_order_stations   — tambah kolom wo_station_number (VARCHAR unique) & notes (TEXT nullable)
 * 2. s_work_order_materials  — rename wo_id → wo_station_id (FK ke s_work_order_stations)
 * 3. s_work_order_issues     — rename wo_id → wo_station_id (FK ke s_work_order_stations)
 * 4. s_work_order_progresses — rename wo_id → wo_station_id (FK ke s_work_order_stations)
 *
 */

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // ─────────────────────────────────────────────────────────────────────
      // 1. s_work_order_stations: tambah wo_station_number & notes
      // ─────────────────────────────────────────────────────────────────────

      await queryInterface.addColumn(
        's_work_order_stations',
        'wo_station_number',
        {
          type:         Sequelize.DataTypes.STRING,
          allowNull:    true,   // nullable dulu agar data lama tidak error
          unique:       true,
          after:        'id',   // MySQL; di PostgreSQL diabaikan
        },
        { transaction }
      );

      await queryInterface.addColumn(
        's_work_order_stations',
        'notes',
        {
          type:      Sequelize.DataTypes.TEXT,
          allowNull: true,
        },
        { transaction }
      );

      // ─────────────────────────────────────────────────────────────────────
      // 2. s_work_order_materials: rename wo_id → wo_station_id
      // ─────────────────────────────────────────────────────────────────────

      // Hapus FK lama ke s_work_orders (nama constraint mungkin perlu disesuaikan)
      await queryInterface.removeConstraint(
        's_work_order_materials',
        's_work_order_materials_wo_id_fkey',   // PostgreSQL default naming
        { transaction }
      ).catch(() =>
        // MySQL naming convention berbeda; coba hapus via removeColumn tidak bisa,
        // jadi kita rename dulu lalu set FK baru
        Promise.resolve()
      );

      await queryInterface.renameColumn(
        's_work_order_materials',
        'wo_id',
        'wo_station_id',
        { transaction }
      );

      await queryInterface.changeColumn(
        's_work_order_materials',
        'wo_station_id',
        {
          type:       Sequelize.DataTypes.INTEGER,
          allowNull:  false,
          references: { model: 's_work_order_stations', key: 'id' },
          onUpdate:   'CASCADE',
          onDelete:   'RESTRICT',
        },
        { transaction }
      );

      // ─────────────────────────────────────────────────────────────────────
      // 3. s_work_order_issues: rename wo_id → wo_station_id
      // ─────────────────────────────────────────────────────────────────────

      await queryInterface.removeConstraint(
        's_work_order_issues',
        's_work_order_issues_wo_id_fkey',
        { transaction }
      ).catch(() => Promise.resolve());

      await queryInterface.renameColumn(
        's_work_order_issues',
        'wo_id',
        'wo_station_id',
        { transaction }
      );

      await queryInterface.changeColumn(
        's_work_order_issues',
        'wo_station_id',
        {
          type:       Sequelize.DataTypes.INTEGER,
          allowNull:  false,
          references: { model: 's_work_order_stations', key: 'id' },
          onUpdate:   'CASCADE',
          onDelete:   'RESTRICT',
        },
        { transaction }
      );

      // ─────────────────────────────────────────────────────────────────────
      // 4. s_work_order_progresses: rename wo_id → wo_station_id
      // ─────────────────────────────────────────────────────────────────────

      await queryInterface.removeConstraint(
        's_work_order_progresses',
        's_work_order_progresses_wo_id_fkey',
        { transaction }
      ).catch(() => Promise.resolve());

      await queryInterface.renameColumn(
        's_work_order_progresses',
        'wo_id',
        'wo_station_id',
        { transaction }
      );

      await queryInterface.changeColumn(
        's_work_order_progresses',
        'wo_station_id',
        {
          type:       Sequelize.DataTypes.INTEGER,
          allowNull:  false,
          references: { model: 's_work_order_stations', key: 'id' },
          onUpdate:   'CASCADE',
          onDelete:   'RESTRICT',
        },
        { transaction }
      );

      // ─────────────────────────────────────────────────────────────────────
      // 5. Tambah index untuk kolom FK baru (performa query)
      // ─────────────────────────────────────────────────────────────────────

      await queryInterface.addIndex(
        's_work_order_materials',
        ['wo_station_id'],
        { name: 'idx_wo_materials_wo_station_id', transaction }
      );

      await queryInterface.addIndex(
        's_work_order_issues',
        ['wo_station_id'],
        { name: 'idx_wo_issues_wo_station_id', transaction }
      );

      await queryInterface.addIndex(
        's_work_order_progresses',
        ['wo_station_id'],
        { name: 'idx_wo_progresses_wo_station_id', transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // ── Hapus index ──────────────────────────────────────────────────────

      await queryInterface.removeIndex(
        's_work_order_materials',
        'idx_wo_materials_wo_station_id',
        { transaction }
      );

      await queryInterface.removeIndex(
        's_work_order_issues',
        'idx_wo_issues_wo_station_id',
        { transaction }
      );

      await queryInterface.removeIndex(
        's_work_order_progresses',
        'idx_wo_progresses_wo_station_id',
        { transaction }
      );

      // ── Revert s_work_order_progresses ──────────────────────────────────

      await queryInterface.removeConstraint(
        's_work_order_progresses',
        's_work_order_progresses_wo_station_id_fkey',
        { transaction }
      ).catch(() => Promise.resolve());

      await queryInterface.renameColumn(
        's_work_order_progresses',
        'wo_station_id',
        'wo_id',
        { transaction }
      );

      await queryInterface.changeColumn(
        's_work_order_progresses',
        'wo_id',
        {
          type:       Sequelize.DataTypes.INTEGER,
          allowNull:  false,
          references: { model: 's_work_orders', key: 'id' },
          onUpdate:   'CASCADE',
          onDelete:   'RESTRICT',
        },
        { transaction }
      );

      // ── Revert s_work_order_issues ───────────────────────────────────────

      await queryInterface.removeConstraint(
        's_work_order_issues',
        's_work_order_issues_wo_station_id_fkey',
        { transaction }
      ).catch(() => Promise.resolve());

      await queryInterface.renameColumn(
        's_work_order_issues',
        'wo_station_id',
        'wo_id',
        { transaction }
      );

      await queryInterface.changeColumn(
        's_work_order_issues',
        'wo_id',
        {
          type:       Sequelize.DataTypes.INTEGER,
          allowNull:  false,
          references: { model: 's_work_orders', key: 'id' },
          onUpdate:   'CASCADE',
          onDelete:   'RESTRICT',
        },
        { transaction }
      );

      // ── Revert s_work_order_materials ────────────────────────────────────

      await queryInterface.removeConstraint(
        's_work_order_materials',
        's_work_order_materials_wo_station_id_fkey',
        { transaction }
      ).catch(() => Promise.resolve());

      await queryInterface.renameColumn(
        's_work_order_materials',
        'wo_station_id',
        'wo_id',
        { transaction }
      );

      await queryInterface.changeColumn(
        's_work_order_materials',
        'wo_id',
        {
          type:       Sequelize.DataTypes.INTEGER,
          allowNull:  false,
          references: { model: 's_work_orders', key: 'id' },
          onUpdate:   'CASCADE',
          onDelete:   'RESTRICT',
        },
        { transaction }
      );

      // ── Revert s_work_order_stations ─────────────────────────────────────

      await queryInterface.removeColumn(
        's_work_order_stations',
        'notes',
        { transaction }
      );

      await queryInterface.removeColumn(
        's_work_order_stations',
        'wo_station_number',
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
