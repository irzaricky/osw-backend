import { Model, DataTypes } from "sequelize";

export default (sequelize) => {
  class SRoutingStationMaterial extends Model {
    static associate(models) {
      SRoutingStationMaterial.belongsTo(models.SPartRoutings, { foreignKey: 'routing_id', as: 'routing' });
      SRoutingStationMaterial.belongsTo(models.SStations, { foreignKey: 'station_id', as: 'station' });
      SRoutingStationMaterial.belongsTo(models.SParts, { foreignKey: 'part_id', as: 'part' }); 
    }
  }

  SRoutingStationMaterial.init({
    routing_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    station_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    qty_per_unit: {
      type: DataTypes.DECIMAL(14, 4),
      allowNull: false,
      defaultValue: 0.0000
    },
    uom: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SRoutingStationMaterial',
    tableName: 's_routing_station_materials',
    underscored: true,
    timestamps: true,
  });

  return SRoutingStationMaterial;
}