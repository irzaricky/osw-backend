'use strict';

/**
 * Migration: Refactor Schema PPC
 *
 * Ringkasan perubahan:
 *
 * TABEL DIHAPUS (12):
 *   ref_bom_activation_statuses, ref_bom_document_statuses,
 *   s_factories, s_production_plan_do_references,
 *   s_production_plan_adjustments, s_production_plan_detail_lines,
 *   s_employee_positions, s_employee_groups, s_employee_group_members,
 *   s_employee_skills, s_skills, s_work_order_station_jobs
 *   (s_suppliers dipertahankan karena masih dipakai s_parts & s_part_suppliers)
 *
 * KOLOM DIUBAH/DITAMBAH/DIHAPUS pada tabel yang ada:
 *   s_boms, s_employees, s_lines, s_work_order_issues,
 *   s_work_order_progresses, s_work_orders, s_work_order_stations,
 *   s_production_plan_capacity_results, s_production_plans,
 *   s_production_orders, s_production_plan_details
 *
 * CATATAN:
 *   - s_bom_details: qty_required & scrap_percentage SUDAH ADA di schema aktual, skip.
 *   - s_work_order_materials: wo_id & material_part_id SUDAH ADA di schema aktual, skip.
 *   - Jalankan migration ini SETELAH semua data lama di-handle (lihat komentar per langkah).
 */

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // =========================================================================
    // BAGIAN 1: HAPUS FK CONSTRAINTS SEBELUM DROP TABEL
    // Sequelize paranoid soft-delete → cek apakah constraint ada sebelum drop.
    // Nama constraint menyesuaikan konvensi default Sequelize (tabel_ibfk_N).
    // Sesuaikan nama constraint jika berbeda di DB Anda.
    // =========================================================================

    // s_employees.position_id → s_employee_positions
    await queryInterface.removeConstraint('s_employees', 's_employees_position_id_foreign_idx').catch(() => {
      // Ignore jika constraint tidak ditemukan (nama berbeda di tiap DB)
      console.warn('WARN: constraint s_employees_position_id_foreign_idx tidak ditemukan, skip.');
    });

    // s_lines.factory_id → s_factories
    // await queryInterface.removeConstraint('s_lines', 's_lines_factory_id_foreign_idx').catch(() => {
    //   console.warn('WARN: constraint s_lines_factory_id_foreign_idx tidak ditemukan, skip.');
    // });

    // s_work_orders.factory_id → s_factories
    await queryInterface.removeConstraint('s_work_orders', 's_work_orders_factory_id_foreign_idx').catch(() => {
      console.warn('WARN: constraint s_work_orders_factory_id_foreign_fkey tidak ditemukan, skip.');
    });

    // s_boms.doc_status_id → ref_bom_document_statuses
    await queryInterface.removeConstraint('s_boms', 's_boms_doc_status_id_foreign_idx').catch(() => {
      console.warn('WARN: constraint s_boms_doc_status_id_foreign_idx tidak ditemukan, skip.');
    });

    // s_boms.activation_status_id → ref_bom_activation_statuses
    await queryInterface.removeConstraint('s_boms', 's_boms_activation_status_id_foreign_idx').catch(() => {
      console.warn('WARN: constraint s_boms_activation_status_id_foreign_idx tidak ditemukan, skip.');
    });

    // s_employee_group_members.group_id → s_employee_groups
    await queryInterface.removeConstraint('s_employee_group_members', 's_employee_group_members_group_id_foreign_idx').catch(() => {
      console.warn('WARN: constraint s_employee_group_members_group_id_foreign_idx tidak ditemukan, skip.');
    });

    // s_employee_skills.skill_id → s_skills
    await queryInterface.removeConstraint('s_employee_skills', 's_employee_skills_skill_id_foreign_idx').catch(() => {
      console.warn('WARN: constraint s_employee_skills_skill_id_foreign_idx tidak ditemukan, skip.');
    });

    // s_work_order_station_jobs.wo_station_id → s_work_order_stations
    await queryInterface.removeConstraint('s_work_order_station_jobs', 's_work_order_station_jobs_wo_station_id_foreign_idx').catch(() => {
      console.warn('WARN: constraint s_work_order_station_jobs_wo_station_id_foreign_idx tidak ditemukan, skip.');
    });


    // =========================================================================
    // BAGIAN 2: DROP TABEL YANG DIHAPUS
    // Urutan: child table dulu sebelum parent.
    // =========================================================================

    // Child tables first
    await queryInterface.dropTable('s_work_order_station_jobs', { cascade: true });
    await queryInterface.dropTable('s_employee_group_members', { cascade: true });
    await queryInterface.dropTable('s_employee_skills', { cascade: true });
    await queryInterface.dropTable('s_production_plan_do_references', { cascade: true });
    await queryInterface.dropTable('s_production_plan_adjustments', { cascade: true });
    await queryInterface.dropTable('s_production_plan_detail_lines', { cascade: true });

    // Parent tables
    await queryInterface.dropTable('s_employee_groups', { cascade: true });
    await queryInterface.dropTable('s_employee_positions', { cascade: true });
    await queryInterface.dropTable('s_skills', { cascade: true });
    await queryInterface.dropTable('ref_bom_activation_statuses', { cascade: true });
    await queryInterface.dropTable('ref_bom_document_statuses', { cascade: true });
    // await queryInterface.dropTable('s_factories', { cascade: true });


    // =========================================================================
    // BAGIAN 3: UBAH s_boms
    // Hapus FK kolom → ganti dengan ENUM langsung
    // =========================================================================

    await queryInterface.removeColumn('s_boms', 'doc_status_id');
    await queryInterface.removeColumn('s_boms', 'activation_status_id');

    await queryInterface.addColumn('s_boms', 'doc_status', {
      type: Sequelize.ENUM('Draft', 'Pending_Approval', 'Approved', 'Rejected'),
      allowNull: false,
      defaultValue: 'Draft',
      after: 'description', // MySQL only; hapus jika pakai PostgreSQL
    });

    await queryInterface.addColumn('s_boms', 'activation_status', {
      type: Sequelize.ENUM('Active', 'Inactive'),
      allowNull: false,
      defaultValue: 'Inactive',
      after: 'doc_status',
    });


    // =========================================================================
    // BAGIAN 4: UBAH s_employees
    // Hapus position_id (FK ke tabel yang sudah dihapus) → ganti position_name
    // PERINGATAN: Jika ada data existing, migrate dulu sebelum removeColumn:
    //   UPDATE s_employees e
    //   JOIN s_employee_positions p ON e.position_id = p.id
    //   SET e.position_name = p.name;
    // =========================================================================

    await queryInterface.addColumn('s_employees', 'position_name', {
      type: Sequelize.STRING(100),
      allowNull: true, // Biarkan nullable dulu agar bisa diisi dari data lama
      after: 'name',
    });

    // Setelah data dimigrate secara manual/script, jalankan:
    await queryInterface.removeColumn('s_employees', 'position_id');


    // =========================================================================
    // BAGIAN 5: UBAH s_lines
    // Hapus factory_id → tambah is_active
    // =========================================================================

    // await queryInterface.removeColumn('s_lines', 'factory_id');

    await queryInterface.addColumn('s_lines', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      after: 'sequence',
    });


    // =========================================================================
    // BAGIAN 6: UBAH s_work_orders
    // Hapus supervisor (STRING) + factory_id → tambah supervisor_id (FK),
    // actual_start_time, actual_end_time
    // =========================================================================

    await queryInterface.removeColumn('s_work_orders', 'supervisor');
    await queryInterface.removeColumn('s_work_orders', 'factory_id');

    await queryInterface.addColumn('s_work_orders', 'supervisor_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 's_users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'status',
    });

    await queryInterface.addColumn('s_work_orders', 'actual_start_time', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'supervisor_id',
    });

    await queryInterface.addColumn('s_work_orders', 'actual_end_time', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'actual_start_time',
    });


    // =========================================================================
    // BAGIAN 7: UBAH s_work_order_issues
    // Hapus reported_by/resolved_by (STRING) → FK ke s_users
    // Tambah kolom pause dan severity
    // =========================================================================

    // await queryInterface.removeColumn('s_work_order_issues', 'reported_by');
    // await queryInterface.removeColumn('s_work_order_issues', 'resolved_by');

    // await queryInterface.addColumn('s_work_order_issues', 'reported_by', {
    //   type: Sequelize.INTEGER,
    //   allowNull: true,
    //   references: { model: 's_users', key: 'id' },
    //   onUpdate: 'CASCADE',
    //   onDelete: 'SET NULL',
    //   after: 'defect_type',
    // });

    // await queryInterface.addColumn('s_work_order_issues', 'resolved_by', {
    //   type: Sequelize.INTEGER,
    //   allowNull: true,
    //   references: { model: 's_users', key: 'id' },
    //   onUpdate: 'CASCADE',
    //   onDelete: 'SET NULL',
    //   after: 'resolved_time',
    // });

    await queryInterface.addColumn('s_work_order_issues', 'severity', {
      type: Sequelize.STRING(20),
      allowNull: true,
      after: 'resolved_by',
    });

    // Pause log columns (merge dari s_work_order_pause_logs)
    await queryInterface.addColumn('s_work_order_issues', 'pause_reason', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'severity',
    });

    await queryInterface.addColumn('s_work_order_issues', 'paused_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 's_users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'pause_reason',
    });

    await queryInterface.addColumn('s_work_order_issues', 'paused_at', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'paused_by',
    });

    await queryInterface.addColumn('s_work_order_issues', 'resumed_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 's_users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'paused_at',
    });

    await queryInterface.addColumn('s_work_order_issues', 'resumed_at', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'resumed_by',
    });

    await queryInterface.addColumn('s_work_order_issues', 'pause_duration_minutes', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'resumed_at',
    });

    await queryInterface.addColumn('s_work_order_issues', 'shift_end_qty', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'pause_duration_minutes',
    });


    // =========================================================================
    // BAGIAN 8: UBAH s_work_order_progresses
    // Hapus reported_by (STRING) → ganti reported_by_user_id (FK)
    // Tambah qty_good, qty_reject, qty_scrap, cumulative_qty_good, reported_at
    // =========================================================================

    // await queryInterface.removeColumn('s_work_order_progresses', 'reported_by');

    // await queryInterface.addColumn('s_work_order_progresses', 'reported_by_user_id', {
    //   type: Sequelize.INTEGER,
    //   allowNull: true,
    //   references: { model: 's_users', key: 'id' },
    //   onUpdate: 'CASCADE',
    //   onDelete: 'SET NULL',
    //   after: 'progress_pct',
    // });

    await queryInterface.addColumn('s_work_order_progresses', 'qty_good', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'reported_by_user_id',
    });

    await queryInterface.addColumn('s_work_order_progresses', 'qty_reject', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'qty_good',
    });

    await queryInterface.addColumn('s_work_order_progresses', 'qty_scrap', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'qty_reject',
    });

    await queryInterface.addColumn('s_work_order_progresses', 'cumulative_qty_good', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'qty_scrap',
    });

    await queryInterface.addColumn('s_work_order_progresses', 'reported_at', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'cumulative_qty_good',
    });


    // =========================================================================
    // BAGIAN 9: UBAH s_work_order_stations
    // Tambah started_at dan completed_at
    // =========================================================================

    await queryInterface.addColumn('s_work_order_stations', 'started_at', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'status',
    });

    await queryInterface.addColumn('s_work_order_stations', 'completed_at', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'started_at',
    });


    // =========================================================================
    // BAGIAN 10: UBAH s_production_plan_capacity_results
    // Hapus total_stations, total_jobs, calculation_version
    // =========================================================================

    await queryInterface.removeColumn('s_production_plan_capacity_results', 'total_stations');
    await queryInterface.removeColumn('s_production_plan_capacity_results', 'total_jobs');
    await queryInterface.removeColumn('s_production_plan_capacity_results', 'calculation_version');


    // =========================================================================
    // BAGIAN 11: UBAH s_production_plans
    // Hapus total_products, total_qty_request (denormalized counter)
    // =========================================================================

    await queryInterface.removeColumn('s_production_plans', 'total_products');
    await queryInterface.removeColumn('s_production_plans', 'total_qty_request');


    // =========================================================================
    // BAGIAN 12: UBAH s_production_orders
    // Hapus total_products, total_planned_qty, total_scheduled_qty, total_actual_qty
    // =========================================================================

    await queryInterface.removeColumn('s_production_orders', 'total_products');
    await queryInterface.removeColumn('s_production_orders', 'total_planned_qty');
    await queryInterface.removeColumn('s_production_orders', 'total_scheduled_qty');
    await queryInterface.removeColumn('s_production_orders', 'total_actual_qty');


    // =========================================================================
    // BAGIAN 13: UBAH s_production_plan_details
    // Hapus priority_score
    // =========================================================================

    await queryInterface.removeColumn('s_production_plan_details', 'priority_score');
  },


  // =========================================================================
  // DOWN: Rollback semua perubahan (urutan terbalik dari UP)
  // Catatan: DROP TABLE tidak bisa di-rollback otomatis — data terhapus permanen.
  // Gunakan hanya di development/staging.
  // =========================================================================

  async down(queryInterface, Sequelize) {
    // -------------------------------------------------------------------------
    // Rollback Bagian 13
    // -------------------------------------------------------------------------
    await queryInterface.addColumn('s_production_plan_details', 'priority_score', {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 0,
    });

    // -------------------------------------------------------------------------
    // Rollback Bagian 12
    // -------------------------------------------------------------------------
    await queryInterface.addColumn('s_production_orders', 'total_products', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('s_production_orders', 'total_planned_qty', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('s_production_orders', 'total_scheduled_qty', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('s_production_orders', 'total_actual_qty', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    // -------------------------------------------------------------------------
    // Rollback Bagian 11
    // -------------------------------------------------------------------------
    await queryInterface.addColumn('s_production_plans', 'total_products', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    });
    await queryInterface.addColumn('s_production_plans', 'total_qty_request', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    });

    // -------------------------------------------------------------------------
    // Rollback Bagian 10
    // -------------------------------------------------------------------------
    await queryInterface.addColumn('s_production_plan_capacity_results', 'total_stations', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('s_production_plan_capacity_results', 'total_jobs', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('s_production_plan_capacity_results', 'calculation_version', {
      type: Sequelize.INTEGER,
      defaultValue: 1,
    });

    // -------------------------------------------------------------------------
    // Rollback Bagian 9
    // -------------------------------------------------------------------------
    await queryInterface.removeColumn('s_work_order_stations', 'completed_at');
    await queryInterface.removeColumn('s_work_order_stations', 'started_at');

    // -------------------------------------------------------------------------
    // Rollback Bagian 8
    // -------------------------------------------------------------------------
    await queryInterface.removeColumn('s_work_order_progresses', 'reported_at');
    await queryInterface.removeColumn('s_work_order_progresses', 'cumulative_qty_good');
    await queryInterface.removeColumn('s_work_order_progresses', 'qty_scrap');
    await queryInterface.removeColumn('s_work_order_progresses', 'qty_reject');
    await queryInterface.removeColumn('s_work_order_progresses', 'qty_good');
    await queryInterface.removeColumn('s_work_order_progresses', 'reported_by_user_id');
    await queryInterface.addColumn('s_work_order_progresses', 'reported_by', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    // -------------------------------------------------------------------------
    // Rollback Bagian 7
    // -------------------------------------------------------------------------
    await queryInterface.removeColumn('s_work_order_issues', 'shift_end_qty');
    await queryInterface.removeColumn('s_work_order_issues', 'pause_duration_minutes');
    await queryInterface.removeColumn('s_work_order_issues', 'resumed_at');
    await queryInterface.removeColumn('s_work_order_issues', 'resumed_by');
    await queryInterface.removeColumn('s_work_order_issues', 'paused_at');
    await queryInterface.removeColumn('s_work_order_issues', 'paused_by');
    await queryInterface.removeColumn('s_work_order_issues', 'pause_reason');
    await queryInterface.removeColumn('s_work_order_issues', 'severity');
    await queryInterface.removeColumn('s_work_order_issues', 'resolved_by');
    await queryInterface.removeColumn('s_work_order_issues', 'reported_by');
    await queryInterface.addColumn('s_work_order_issues', 'reported_by', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('s_work_order_issues', 'resolved_by', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    // -------------------------------------------------------------------------
    // Rollback Bagian 6
    // -------------------------------------------------------------------------
    await queryInterface.removeColumn('s_work_orders', 'actual_end_time');
    await queryInterface.removeColumn('s_work_orders', 'actual_start_time');
    await queryInterface.removeColumn('s_work_orders', 'supervisor_id');
    await queryInterface.addColumn('s_work_orders', 'supervisor', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('s_work_orders', 'factory_id', {
      type: Sequelize.INTEGER,
      allowNull: true, // nullable di rollback karena tabel factories sudah tidak ada
    });

    // -------------------------------------------------------------------------
    // Rollback Bagian 5
    // -------------------------------------------------------------------------
    await queryInterface.removeColumn('s_lines', 'is_active');
    await queryInterface.addColumn('s_lines', 'factory_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // -------------------------------------------------------------------------
    // Rollback Bagian 4
    // -------------------------------------------------------------------------
    await queryInterface.addColumn('s_employees', 'position_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.removeColumn('s_employees', 'position_name');

    // -------------------------------------------------------------------------
    // Rollback Bagian 3
    // -------------------------------------------------------------------------
    await queryInterface.removeColumn('s_boms', 'activation_status');
    await queryInterface.removeColumn('s_boms', 'doc_status');
    // Untuk PostgreSQL, drop ENUM type juga:
    // await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_s_boms_doc_status";');
    // await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_s_boms_activation_status";');
    await queryInterface.addColumn('s_boms', 'doc_status_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('s_boms', 'activation_status_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // -------------------------------------------------------------------------
    // Rollback Bagian 1 & 2: Recreate dropped tables
    // CATATAN: Data yang sudah dihapus TIDAK bisa dikembalikan.
    // Struktur di bawah hanya untuk integritas referensial.
    // -------------------------------------------------------------------------

    await queryInterface.createTable('ref_bom_activation_statuses', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      sequence: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.createTable('ref_bom_document_statuses', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      sequence: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.createTable('s_factories', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      address: { type: Sequelize.TEXT, allowNull: true },
      phone: { type: Sequelize.STRING, allowNull: true },
      maps_url: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.createTable('s_employee_positions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('s_skills', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('s_employee_groups', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      line_id: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      leader_id: { type: Sequelize.INTEGER, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('s_employee_group_members', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      group_id: { type: Sequelize.INTEGER, allowNull: false },
      employee_id: { type: Sequelize.INTEGER, allowNull: false },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('s_employee_skills', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      employee_id: { type: Sequelize.INTEGER, allowNull: false },
      skill_id: { type: Sequelize.INTEGER, allowNull: false },
      level: { type: Sequelize.INTEGER, defaultValue: 1 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('s_production_plan_do_references', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      plan_id: { type: Sequelize.INTEGER, allowNull: false },
      do_id: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('s_production_plan_adjustments', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      plan_id: { type: Sequelize.INTEGER, allowNull: false },
      line_id: { type: Sequelize.INTEGER, allowNull: false },
      adjustment_type: { type: Sequelize.STRING(50), allowNull: false },
      adjustment_description: { type: Sequelize.TEXT, allowNull: true },
      sequence: { type: Sequelize.INTEGER, defaultValue: 0 },
      base_value: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      adjusted_value: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      difference: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      capacity_impact_minutes: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
      created_by: { type: Sequelize.STRING(100), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.createTable('s_production_plan_detail_lines', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      plan_detail_id: { type: Sequelize.INTEGER, allowNull: false },
      line_id: { type: Sequelize.INTEGER, allowNull: false },
      sequence: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      qty_capacity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      capacity_gap: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'Not_Calculated' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.createTable('s_work_order_station_jobs', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      wo_station_id: { type: Sequelize.INTEGER, allowNull: false },
      station_job_id: { type: Sequelize.INTEGER, allowNull: false },
      job_id: { type: Sequelize.INTEGER, allowNull: false },
      sequence: { type: Sequelize.INTEGER, allowNull: false },
      standard_time: { type: Sequelize.INTEGER, allowNull: false },
      actual_time: { type: Sequelize.INTEGER, allowNull: true },
      status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'Pending' },
      station_name_snapshot: { type: Sequelize.STRING, allowNull: true },
      job_name_snapshot: { type: Sequelize.STRING, allowNull: true },
      standard_time_snapshot: { type: Sequelize.INTEGER, allowNull: true },
      setup_time_snapshot: { type: Sequelize.INTEGER, allowNull: true },
      operator_id: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
    });
  },
};