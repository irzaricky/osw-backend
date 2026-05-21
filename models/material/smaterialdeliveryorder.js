'use strict';
import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SMaterialDeliveryOrder extends Model {
    static associate(models) {
      SMaterialDeliveryOrder.belongsTo(models.SMaterialPurchaseOrder, { foreignKey: 'mpo_id', as: 'mpo' });
      SMaterialDeliveryOrder.belongsTo(models.SDocks, { foreignKey: 'dock_id', as: 'dock' });
      SMaterialDeliveryOrder.belongsTo(models.SVehicles, { foreignKey: 'vehicle_id', as: 'vehicle' }); // ← BARU
      SMaterialDeliveryOrder.hasOne(models.TMaterialReceiving, { foreignKey: 'mdo_id', as: 'material_receiving' });
      SMaterialDeliveryOrder.hasMany(models.TMaterialDeliveryOrderDetail, { foreignKey: 'mdo_id', as: 'mdo_details' });
    }
  }

  SMaterialDeliveryOrder.init({
    mpo_id: DataTypes.INTEGER,
    dock_id: DataTypes.INTEGER,
    vehicle_id: DataTypes.INTEGER,       // ← BARU: FK ke s_vehicles
    number: DataTypes.STRING,
    description: DataTypes.STRING,
    target_date: DataTypes.DATEONLY,
    target_time: DataTypes.TIME,          // ← BARU: slot jam bongkar
    transporter: DataTypes.STRING,
    status: DataTypes.STRING,
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER,
    approved_by: DataTypes.INTEGER,
  }, {
    sequelize,
    modelName: 'SMaterialDeliveryOrder',
    tableName: 's_material_delivery_orders',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
  });

  return SMaterialDeliveryOrder;
};