import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TStationBufferStock extends Model {
    static associate(models) {
      TStationBufferStock.belongsTo(models.SStations, {
        foreignKey: 'station_id',
        as: 'station'
      });

      TStationBufferStock.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part'
      });

      TStationBufferStock.belongsTo(
        models.TPartLabels,
        {
          foreignKey: 'label_id',
          as: 'label'
        }
      );
    }
  }

  TStationBufferStock.init({
    station_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    label_id: {
      type: DataTypes.INTEGER,
      allowNull: true
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
    oldest_supply_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    latest_supply_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'TStationBufferStock',
    tableName: 't_station_buffer_stock',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
    indexes: [
      {
        unique: true,
        fields: ['station_id', 'part_id'],
        name: 'uq_station_buffer_stock_station_part'
      }
    ]
  });

  return TStationBufferStock;
};