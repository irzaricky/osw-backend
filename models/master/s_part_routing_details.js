import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SPartRoutingDetails extends Model {
    static associate(models) {
      SPartRoutingDetails.belongsTo(models.SPartRoutings, { foreignKey: 'routing_id', as: 'routing' });
      SPartRoutingDetails.belongsTo(models.SStations, { foreignKey: 'station_id', as: 'station' });
      SPartRoutingDetails.hasMany(models.SPartRoutingDetailMaterials, { foreignKey: 'routing_detail_id', as: 'materials' });
      SPartRoutingDetails.hasMany(models.SPartRoutingDetailOutputs, { foreignKey: 'routing_detail_id', as: 'outputs' });
    }
  }

  SPartRoutingDetails.init({
    routing_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    station_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    output_part_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
  }, {
    sequelize,
    modelName: 'SPartRoutingDetails',
    tableName: 's_part_routing_details',
    underscored: true,
    timestamps: true
  });

  return SPartRoutingDetails;
};