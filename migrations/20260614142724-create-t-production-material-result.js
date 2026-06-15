'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_production_material_result', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },

      production_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },

      shift_id: {
        type: Sequelize.INTEGER,
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
        defaultValue: 0
      },

      actual_qty: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },

      total_ok: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },

      total_ng: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },

      remarks: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      batch_number: {
        type: Sequelize.STRING,
        allowNull: true
      },

      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true
      },

      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()')
      },

      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()')
      },

      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_production_material_result')
  }
}