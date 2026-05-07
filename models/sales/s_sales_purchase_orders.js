import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SSalesPurchaseOrders extends Model {
    static associate(models) {
      SSalesPurchaseOrders.belongsTo(models.SCustomers, { foreignKey: 'customer_id', as: 'customer' });
      SSalesPurchaseOrders.belongsTo(models.SSalesPurchaseRequests, { foreignKey: 'spr_id', as: 'spr' });
      SSalesPurchaseOrders.belongsTo(models.SUsers, { foreignKey: 'created_by', as: 'creator' });
      SSalesPurchaseOrders.hasMany(models.SSalesPurchaseOrderDetails, { foreignKey: 'spo_id', as: 'details' });
    }
  }

  SSalesPurchaseOrders.init({
    spo_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    spr_id: DataTypes.INTEGER,
    shipping_address: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    spo_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    delivery_due_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Draft'
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'SSalesPurchaseOrders',
    tableName: 's_sales_purchase_orders',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SSalesPurchaseOrders;
};
