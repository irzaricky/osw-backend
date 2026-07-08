'use strict';
import { Model, DataTypes } from 'sequelize';
 
export default (sequelize) => {
  class SMaterialPurchaseRequestLog extends Model {
    static associate(models) {
      SMaterialPurchaseRequestLog.belongsTo(models.SMaterialPurchaseRequest, {
        foreignKey: 'mpr_id',
        as: 'purchaseRequest'
      });
      SMaterialPurchaseRequestLog.belongsTo(models.SUsers, {
        foreignKey: 'user_id',
        as: 'user'
      });
    }
  }
 
  SMaterialPurchaseRequestLog.init({
    mpr_id:  DataTypes.INTEGER,
    user_id: DataTypes.INTEGER,
    action:  DataTypes.STRING,   // 'created' | 'submitted' | 'approved' | 'rejected' | 'updated'
    status:  DataTypes.STRING,   // snapshot status dokumen saat log dibuat
    remarks: DataTypes.TEXT      // catatan rejection / approval
  }, {
    sequelize,
    modelName: 'SMaterialPurchaseRequestLog',
    tableName: 's_material_purchase_request_logs',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });
 
  return SMaterialPurchaseRequestLog;
};