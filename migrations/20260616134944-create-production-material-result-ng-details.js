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

        source_label_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 't_part_labels',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },

        source_label_number: {
          type: Sequelize.STRING(120),
          allowNull: true
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
          defaultValue: Sequelize.literal('NOW()')
        },

        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()')
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

    await queryInterface.addIndex(
      't_production_material_result_ng_details',
      ['source_label_id']
    )
  },

  async down(queryInterface) {
    await queryInterface.dropTable(
      't_production_material_result_ng_details'
    )
  }
}