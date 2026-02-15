import { Model } from 'sequelize';

export default (sequelize, DataTypes) => {
  class SModules extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      SModules.hasMany(models.SAuditLogs, {
        foreignKey: 'module_id',
        as: 'audit_logs'
      });
    }
  }

  SModules.init({
    name: DataTypes.STRING,
    code: DataTypes.STRING,
    icon: DataTypes.STRING,
    sequence: DataTypes.INTEGER,
    deleted_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'SModules',
    tableName: 's_modules',
    underscored: true,
    paranoid: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
  });

  return SModules;
};
