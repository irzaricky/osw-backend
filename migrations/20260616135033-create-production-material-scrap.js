'use strict'

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_production_material_scrap', {
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

      scrap_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
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

      part_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_parts',
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

      qty_scrap: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      weight_per_pcs: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },

      total_weight: {
        type: Sequelize.DECIMAL(10, 2),
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
    })

    await queryInterface.addIndex('t_production_material_scrap', ['production_result_id'])
    await queryInterface.addIndex('t_production_material_scrap', ['station_id'])
    await queryInterface.addIndex('t_production_material_scrap', ['part_id'])
    await queryInterface.addIndex('t_production_material_scrap', ['material_part_id'])
    await queryInterface.addIndex('t_production_material_scrap', ['source_label_id'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_production_material_scrap')
  }
}