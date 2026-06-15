export async function up(queryInterface, Sequelize) {
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
      type: Sequelize.STRING(20),
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
  });

  await queryInterface.addConstraint('t_station_buffer_stock_log', {
    fields: ['transaction_type'],
    type: 'check',
    name: 'chk_station_buffer_log_transaction_type',
    where: {
      transaction_type: ['IN', 'OUT', 'SCRAP']
    }
  });
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.dropTable('t_station_buffer_stock_log');
}