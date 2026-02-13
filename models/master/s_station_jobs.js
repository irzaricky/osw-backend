import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SStationJobs extends Model {
    static associate(models) {
      SStationJobs.belongsTo(models.SStations, { foreignKey: 'station_id', as: 'station' });
      SStationJobs.belongsTo(models.SJobs, { foreignKey: 'job_id', as: 'job' });
    }
  }

  SStationJobs.init({
    station_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    job_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    mandatory: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'SStationJobs',
    tableName: 's_station_jobs',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SStationJobs;
};
