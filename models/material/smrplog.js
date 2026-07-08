'use strict';
import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SMrpLog extends Model {
    static associate(models) {
      SMrpLog.belongsTo(models.SMrp, {
        foreignKey: 'mrp_id',
        as: 'mrp'
      });
      SMrpLog.belongsTo(models.SUsers, {
        foreignKey: 'user_id',
        as: 'user'
      });
    }
  }

  SMrpLog.init({
    mrp_id:  DataTypes.INTEGER,
    user_id: DataTypes.INTEGER,
    action:  DataTypes.STRING,   // 'created' | 'submitted' | 'approved' | 'rejected' | 'updated' | 'deleted'
    status:  DataTypes.STRING,   // snapshot status dokumen saat log dibuat
    notes:   DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'SMrpLog',
    tableName: 's_mrp_logs',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SMrpLog;
};