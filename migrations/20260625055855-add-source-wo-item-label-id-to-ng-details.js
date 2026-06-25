'use strict'

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      't_production_material_result_ng_details',
      'source_wo_item_label_id',
      {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 't_work_order_storing_item_label',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }
    )

    await queryInterface.addIndex(
      't_production_material_result_ng_details',
      ['source_wo_item_label_id'],
      {
        name: 'idx_pm_result_ng_details_source_wo_item_label_id'
      }
    )
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      't_production_material_result_ng_details',
      'idx_pm_result_ng_details_source_wo_item_label_id'
    )

    await queryInterface.removeColumn(
      't_production_material_result_ng_details',
      'source_wo_item_label_id'
    )
  }
}