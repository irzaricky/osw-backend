export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('t_station_buffer_stock', {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
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

    oldest_supply_at: {
      type: Sequelize.DATE,
      allowNull: true
    },

    latest_supply_at: {
      type: Sequelize.DATE,
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
  });

  await queryInterface.addIndex(
    't_station_buffer_stock',
    ['station_id', 'part_id'],
    {
      unique: true,
      name: 'uq_station_buffer_stock_station_part'
    }
  );
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.dropTable('t_station_buffer_stock');
}