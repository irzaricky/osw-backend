'use strict';
import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SMaterialPurchaseOrderLog extends Model {
    static associate(models) {
      SMaterialPurchaseOrderLog.belongsTo(models.SMaterialPurchaseOrder, {
        foreignKey: 'mpo_id',
        as: 'purchaseOrder'
      });
      SMaterialPurchaseOrderLog.belongsTo(models.SUsers, {
        foreignKey: 'user_id',
        as: 'user'
      });
    }
  }

  SMaterialPurchaseOrderLog.init({
    mpo_id:  DataTypes.INTEGER,
    user_id: DataTypes.INTEGER,
    action:  DataTypes.STRING,   // 'created' | 'submitted' | 'approved' | 'rejected' | 'updated'
    status:  DataTypes.STRING,   // snapshot status dokumen saat log dibuat
    notes:   DataTypes.TEXT      // catatan rejection / approval (konsisten dengan field lama)
  }, {
    sequelize,
    modelName: 'SMaterialPurchaseOrderLog',
    tableName: 's_material_purchase_order_logs',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SMaterialPurchaseOrderLog;
};