'use strict';
import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TMaterialPurchaseRequestDetail extends Model {
    static associate(models) {
      TMaterialPurchaseRequestDetail.belongsTo(models.SMaterialPurchaseRequest, {
        foreignKey: 'mpr_id',
        as: 'purchaseRequest'
      });
      TMaterialPurchaseRequestDetail.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part'
      });
    }
  }

  TMaterialPurchaseRequestDetail.init({
    mpr_id: DataTypes.INTEGER,
    part_id: DataTypes.INTEGER,
    qty: DataTypes.DECIMAL,
    required_date: DataTypes.DATEONLY,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'TMaterialPurchaseRequestDetail',
    tableName: 's_material_purchase_request_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TMaterialPurchaseRequestDetail;
};