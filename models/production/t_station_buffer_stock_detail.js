import { Model, DataTypes } from 'sequelize'

export default (sequelize) => {
  class TStationBufferStockDetail extends Model {
    static associate(models) {
      TStationBufferStockDetail.belongsTo(models.TStationBufferStock, {
        foreignKey: 'buffer_stock_id',
        as: 'buffer_stock'
      })

      TStationBufferStockDetail.belongsTo(models.SStations, {
        foreignKey: 'station_id',
        as: 'station'
      })

      TStationBufferStockDetail.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part'
      })

      TStationBufferStockDetail.belongsTo(models.TPartLabels, {
        foreignKey: 'source_label_id',
        as: 'source_label'
      })

      TStationBufferStockDetail.belongsTo(models.TWorkOrderStoringItemLabel, {
        foreignKey: 'source_wo_item_label_id',
        as: 'source_wo_item_label'
      })
    }
  }

  TStationBufferStockDetail.init(
    {
      buffer_stock_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      station_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      part_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      source_label_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      source_label_number: {
        type: DataTypes.STRING(120),
        allowNull: true
      },

      source_wo_item_label_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      pcs_no: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      pcs_label_number: {
        type: DataTypes.STRING(150),
        allowNull: false
      },

      status: {
        type: DataTypes.ENUM('AVAILABLE', 'USED', 'SCRAP'),
        allowNull: false,
        defaultValue: 'AVAILABLE'
      },

      source_reference_type: {
        type: DataTypes.STRING(80),
        allowNull: true
      },

      source_reference_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      used_reference_type: {
        type: DataTypes.STRING(80),
        allowNull: true
      },

      used_reference_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      used_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'TStationBufferStockDetail',
      tableName: 't_station_buffer_stock_detail',
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at'
    }
  )

  return TStationBufferStockDetail
}