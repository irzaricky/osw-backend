import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SSalesPurchaseOrderDetails extends Model {
    static associate(models) {
      SSalesPurchaseOrderDetails.belongsTo(models.SSalesPurchaseOrders, { foreignKey: 'spo_id', as: 'order' });
      SSalesPurchaseOrderDetails.belongsTo(models.SParts, { foreignKey: 'part_id', as: 'part' });
    }
  }

  SSalesPurchaseOrderDetails.init({
    spo_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ordered_qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    sent_qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    last_shipment_date: DataTypes.DATEONLY,
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'Open'
    }
  }, {
    sequelize,
    modelName: 'SSalesPurchaseOrderDetails',
    tableName: 's_sales_purchase_order_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SSalesPurchaseOrderDetails;
};
