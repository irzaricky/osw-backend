import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefJobTypes extends Model {
    static associate(models) {
      RefJobTypes.hasMany(models.SJobs, { foreignKey: 'job_type_id', as: 'jobs' });
    }
  }

  RefJobTypes.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'RefJobTypes',
    tableName: 'ref_job_types',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefJobTypes;
};
