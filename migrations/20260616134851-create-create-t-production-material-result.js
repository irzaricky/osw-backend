'use strict'

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_production_material_result', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },

      production_wo_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 's_work_orders',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      production_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },

      shift_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_shifts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
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
        allowNull: true,
        references: {
          model: 's_parts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      planning_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      actual_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      total_ok: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      total_ng: {
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
    })

    await queryInterface.addIndex('t_production_material_result', ['production_wo_id'])
    await queryInterface.addIndex('t_production_material_result', ['shift_id'])
    await queryInterface.addIndex('t_production_material_result', ['station_id'])
    await queryInterface.addIndex('t_production_material_result', ['part_id'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_production_material_result')
  }
}