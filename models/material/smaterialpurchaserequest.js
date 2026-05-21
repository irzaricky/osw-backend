'use strict';
import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SMaterialPurchaseRequest extends Model {
    static associate(models) {
      SMaterialPurchaseRequest.belongsTo(models.SMrp, {
        foreignKey: 'mrp_id',
        as: 'mrp'
      });
      SMaterialPurchaseRequest.belongsTo(models.SUsers, {
        foreignKey: 'created_by',
        as: 'creator'
      });
      SMaterialPurchaseRequest.belongsTo(models.SUsers, {
        foreignKey: 'approved_by',
        as: 'approver'
      });
      SMaterialPurchaseRequest.hasMany(models.TMaterialPurchaseRequestDetail, {
        foreignKey: 'mpr_id',
        as: 'details'
      });
      SMaterialPurchaseRequest.hasMany(models.SMaterialPurchaseRequestLog, {
        foreignKey: 'mpr_id',
        as: 'logs'
      });
    }
  }

  SMaterialPurchaseRequest.init({
    mrp_id: DataTypes.INTEGER,
    number: DataTypes.STRING,
    description: DataTypes.STRING,
    request_date: DataTypes.DATEONLY,
    type: DataTypes.STRING,       // 'auto' | 'manual'
    status: DataTypes.STRING,     // 'draft' | 'submitted' | 'approved' | 'rejected'
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER,
    approved_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'SMaterialPurchaseRequest',
    tableName: 's_material_purchase_requests',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SMaterialPurchaseRequest;
};