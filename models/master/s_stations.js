import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SStations extends Model {
    static associate(models) {
      SStations.belongsTo(models.SLines, { foreignKey: 'line_id', as: 'line' });
      SStations.belongsTo(models.RefStationTypes, { foreignKey: 'station_type_id', as: 'station_type' });
      SStations.hasMany(models.SStationJobs, { foreignKey: 'station_id', as: 'station_jobs' });
      SStations.hasMany(models.SPartRoutingDetails, { foreignKey: 'station_id', as: 'routing_details' });
    }
  }

  SStations.init({
    station_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    station_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'SStations',
    tableName: 's_stations',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SStations;
};
