'use strict'

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      't_production_material_scrap',
      'replacement_id',
      {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 't_production_material_replacement',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }
    )

    await queryInterface.addIndex(
      't_production_material_scrap',
      ['replacement_id'],
      {
        name: 'idx_production_material_scrap_replacement_id'
      }
    )
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      't_production_material_scrap',
      'idx_production_material_scrap_replacement_id'
    )

    await queryInterface.removeColumn(
      't_production_material_scrap',
      'replacement_id'
    )
  }
}