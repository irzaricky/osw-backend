'use strict'

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_production_material_replacement', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
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

      station_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_stations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
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

      qty_replacement: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      replacement_reason: {
        type: Sequelize.TEXT,
        allowNull: true
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

      source_wo_item_label_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 't_work_order_storing_item_label',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
    })

    await queryInterface.addIndex('t_production_material_replacement', ['production_result_id'])
    await queryInterface.addIndex('t_production_material_replacement', ['station_id'])
    await queryInterface.addIndex('t_production_material_replacement', ['material_part_id'])
    await queryInterface.addIndex('t_production_material_replacement', ['source_label_id'])
    await queryInterface.addIndex('t_production_material_replacement', ['source_wo_item_label_id'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_production_material_replacement')
  }
}