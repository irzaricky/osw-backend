import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefActivities extends Model {
    static associate(models) {
      RefActivities.hasMany(models.SAuditLogs, { foreignKey: 'activity_id', as: 'audit_logs' });
    }
  }

  RefActivities.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'RefActivities',
    tableName: 'ref_activities',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefActivities;
};
