'use strict'

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_station_buffer_stock_log', {
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
        onDelete: 'RESTRICT'
      },

      transaction_type: {
        type: Sequelize.ENUM('IN', 'OUT', 'SCRAP'),
        allowNull: false
      },

      qty_kanban: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      qty_pcs: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      reference_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },

      reference_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },

      remarks: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 's_users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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

    await queryInterface.addIndex('t_station_buffer_stock_log', ['buffer_stock_id'])
    await queryInterface.addIndex('t_station_buffer_stock_log', ['transaction_type'])
    await queryInterface.addIndex('t_station_buffer_stock_log', ['reference_type', 'reference_id'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_station_buffer_stock_log')

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_t_station_buffer_stock_log_transaction_type";'
    )
  }
}