'use strict';
import {
  Model, DataTypes
} from 'sequelize';
export default (sequelize) => {
  class SMaterialDeliveryOrder extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      SMaterialDeliveryOrder.belongsTo(models.SMaterialPurchaseOrder, { foreignKey: 'mpo_id', as: 'mpo' });
      SMaterialDeliveryOrder.belongsTo(models.SDocks, { foreignKey: 'dock_id', as: 'dock' });
      SMaterialDeliveryOrder.hasOne(models.TMaterialReceiving, { foreignKey: 'mdo_id', as: 'material_receiving' });
      SMaterialDeliveryOrder.hasMany(models.TMaterialDeliveryOrderDetail, { foreignKey: 'mdo_id', as: 'mdo_details' });
    }
  }
  SMaterialDeliveryOrder.init({
    mpo_id: DataTypes.INTEGER,
    dock_id: DataTypes.INTEGER,
    number: DataTypes.STRING,
    description: DataTypes.STRING,
    target_date: DataTypes.DATEONLY,
    transporter: DataTypes.STRING,
    status: DataTypes.STRING,
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER,
    approved_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'SMaterialDeliveryOrder',
    tableName: 's_material_delivery_orders',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });
  return SMaterialDeliveryOrder;
};