'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      't_production_material_replacement',
      'ng_detail_id',
      {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 't_production_material_result_ng_details',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }
    )

    await queryInterface.addIndex(
      't_production_material_replacement',
      ['ng_detail_id']
    )
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      't_production_material_replacement',
      ['ng_detail_id']
    )

    await queryInterface.removeColumn(
      't_production_material_replacement',
      'ng_detail_id'
    )
  }
}