import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SJobs extends Model {
    static associate(models) {
      SJobs.belongsTo(models.RefJobTypes, { foreignKey: 'job_type_id', as: 'job_type' });
      SJobs.hasMany(models.SStationJobs, { foreignKey: 'job_id', as: 'station_jobs' });
      SJobs.hasMany(models.SPartRoutingDetails, { foreignKey: 'job_id', as: 'routing_details' });
    }
  }

  SJobs.init({
    job_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    job_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    standard_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'SJobs',
    tableName: 's_jobs',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SJobs;
};
