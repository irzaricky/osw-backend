'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
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

      warehouse_stock_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },

      label_number: {
        type: Sequelize.STRING,
        allowNull: true
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

      status: {
        type: Sequelize.ENUM(
          'PENDING',
          'APPROVED',
          'USED',
          'REJECTED'
        ),
        defaultValue: 'PENDING'
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

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('t_production_material_replacement')

    // penting untuk ENUM cleanup (postgres)
    await queryInterface.sequelize.query(
      `DROP TYPE IF EXISTS "enum_t_production_material_replacement_status";`
    )
  }
}