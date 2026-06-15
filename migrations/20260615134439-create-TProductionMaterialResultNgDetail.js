'use strict'

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      't_production_material_result_ng_details',
      {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },

        production_result_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 't_production_material_result',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },

        material_part_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 's_parts',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },

        qty_ng: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },

        remarks: {
          type: Sequelize.TEXT,
          allowNull: true
        },

        created_by: {
          type: Sequelize.INTEGER,
          allowNull: true
        },

        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },

        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },

        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true
        }
      }
    )

    await queryInterface.addIndex(
      't_production_material_result_ng_details',
      ['production_result_id']
    )

    await queryInterface.addIndex(
      't_production_material_result_ng_details',
      ['material_part_id']
    )
  },

  async down(queryInterface) {
    await queryInterface.dropTable(
      't_production_material_result_ng_details'
    )
  }
}