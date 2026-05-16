'use strict';
import {
  Model, DataTypes
} from 'sequelize';
export default (sequelize) => {
  class SMaterialPurchaseOrder extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      SMaterialPurchaseOrder.belongsTo(models.SSuppliers, { foreignKey: 'supplier_id', as: 'supplier' });
      SMaterialPurchaseOrder.belongsTo(models.SWarehouses, { foreignKey: 'warehouse_id', as: 'warehouse' });
      SMaterialPurchaseOrder.hasMany(models.SMaterialDeliveryOrder, { foreignKey: 'mpo_id', as: 'material_delivery_orders' });
    }
  }
  SMaterialPurchaseOrder.init({
    mpr_id: DataTypes.INTEGER,
    supplier_id: DataTypes.INTEGER,
    warehouse_id: DataTypes.INTEGER,
    number: DataTypes.STRING,
    description: DataTypes.STRING,
    po_date: DataTypes.DATEONLY,
    payment_term: DataTypes.STRING,
    status: DataTypes.STRING,
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER,
    approved_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'SMaterialPurchaseOrder',
    tableName: 's_material_purchase_orders',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });
  return SMaterialPurchaseOrder;
};