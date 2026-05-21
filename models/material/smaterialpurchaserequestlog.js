'use strict';
import { Model, DataTypes } from 'sequelize';
 
export default (sequelize) => {
  class SMaterialPurchaseRequestLog extends Model {
    static associate(models) {
      SMaterialPurchaseRequestLog.belongsTo(models.SMaterialPurchaseRequest, {
        foreignKey: 'mpr_id',
        as: 'purchaseRequest'
      });
    }
  }
 
  SMaterialPurchaseRequestLog.init({
    mpr_id: DataTypes.INTEGER,
    action: DataTypes.STRING  // 'created' | 'submitted' | 'approved' | 'rejected' | 'updated'
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
 