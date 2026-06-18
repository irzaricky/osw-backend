'use strict'

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_station_buffer_stock_detail', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },

      buffer_stock_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 't_station_buffer_stock',
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

      pcs_no: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      pcs_label_number: {
        type: Sequelize.STRING(150),
        allowNull: false
      },

      status: {
        type: Sequelize.ENUM('AVAILABLE', 'USED', 'SCRAP'),
        allowNull: false,
        defaultValue: 'AVAILABLE'
      },

      source_reference_type: {
        type: Sequelize.STRING(80),
        allowNull: true
      },

      source_reference_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },

      used_reference_type: {
        type: Sequelize.STRING(80),
        allowNull: true
      },

      used_reference_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },

      used_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('t_station_buffer_stock_detail', ['buffer_stock_id'])
    await queryInterface.addIndex('t_station_buffer_stock_detail', ['station_id', 'part_id'])
    await queryInterface.addIndex('t_station_buffer_stock_detail', ['source_label_id'])
    await queryInterface.addIndex('t_station_buffer_stock_detail', ['status'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_station_buffer_stock_detail')

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_t_station_buffer_stock_detail_status";'
    )
  }
}