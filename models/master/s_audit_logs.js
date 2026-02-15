import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SAuditLogs extends Model {
    static associate(models) {
      SAuditLogs.belongsTo(models.SUsers, { foreignKey: 'user_id', as: 'user' });
      SAuditLogs.belongsTo(models.SModules, { foreignKey: 'module_id', as: 'module' });
      SAuditLogs.belongsTo(models.RefActivities, { foreignKey: 'activity_id', as: 'activity' });
    }
  }

  SAuditLogs.init({
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    module_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    activity_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    resource_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    old_data: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    new_data: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SAuditLogs',
    tableName: 's_audit_logs',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SAuditLogs;
};
