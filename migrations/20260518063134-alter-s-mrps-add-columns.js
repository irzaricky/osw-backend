'use strict';
/**
 * Migration: Alter s_mrps
 * Tambah kolom:
 *   - spr_id     : FK ke s_sales_purchase_requests (Sales Plan sumber MRP)
 *   - priority   : string free-text (High, Medium, Low)
 *   - notes      : catatan dari Staff Material
 *   - rejected_notes : catatan penolakan dari Supervisor
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_mrps', 'spr_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_sales_purchase_requests',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Sales Purchase Request sumber MRP (opsional)',
    });

    await queryInterface.addColumn('s_mrps', 'priority', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'High, Medium, Low',
    });

    await queryInterface.addColumn('s_mrps', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Catatan dari Staff Material',
    });

    await queryInterface.addColumn('s_mrps', 'rejected_notes', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Alasan penolakan dari Supervisor Material',
    });

    await queryInterface.addIndex('s_mrps', ['status']);
    await queryInterface.addIndex('s_mrps', ['spr_id']);
    await queryInterface.addIndex('s_mrps', ['production_plan_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('s_mrps', 'rejected_notes');
    await queryInterface.removeColumn('s_mrps', 'notes');
    await queryInterface.removeColumn('s_mrps', 'priority');
    await queryInterface.removeColumn('s_mrps', 'spr_id');
  },
};