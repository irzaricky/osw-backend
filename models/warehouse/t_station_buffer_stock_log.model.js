import { Model, DataTypes } from 'sequelize'

export default (sequelize) => {
  class TStationBufferStockLog extends Model {
    static associate(models) {
      TStationBufferStockLog.belongsTo(
        models.TStationBufferStock,
        {
          foreignKey: 'buffer_stock_id',
          as: 'buffer_stock'
        }
      )

      TStationBufferStockLog.belongsTo(
        models.SUsers,
        {
          foreignKey: 'created_by',
          as: 'user'
        }
      )
    }
  }

  TStationBufferStockLog.init(
    {
      buffer_stock_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      transaction_type: {
        type: DataTypes.ENUM(
          'IN',
          'OUT',
          'SCRAP'
        ),
        allowNull: false
      },

      qty_kanban: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      qty_pcs: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      reference_type: {
        type: DataTypes.STRING(50),
        allowNull: true
      },

      reference_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      remarks: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'TStationBufferStockLog',
      tableName: 't_station_buffer_stock_log',
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at'
    }
  )

  return TStationBufferStockLog
}