import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SWorkOrderStationJob extends Model {
    static associate(models) {
      SWorkOrderStationJob.belongsTo(models.SWorkOrderStation, { foreignKey: 'wo_station_id', as: 'work_order_station' });
      SWorkOrderStationJob.belongsTo(models.SStationJobs, { foreignKey: 'station_job_id', as: 'station_job' });
      SWorkOrderStationJob.belongsTo(models.SJobs, { foreignKey: 'job_id', as: 'job' });
    }
  }

  SWorkOrderStationJob.init({
    wo_station_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    station_job_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    job_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    standard_time: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    actual_time: {
      type: DataTypes.INTEGER
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Pending'
    }
  }, {
    sequelize,
    modelName: 'SWorkOrderStationJob',
    tableName: 's_work_order_station_jobs',
    underscored: true,
    timestamps: true,
    updatedAt: false,
    paranoid: false
  });

  return SWorkOrderStationJob;
};