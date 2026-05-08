import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SDeliveryOrderDetails extends Model {
    static associate(models) {
      SDeliveryOrderDetails.belongsTo(models.SDeliveryOrders, { foreignKey: 'delivery_order_id', as: 'deliveryOrder' });
      SDeliveryOrderDetails.belongsTo(models.SDeliveryPlanDetails, { foreignKey: 'delivery_plan_detail_id', as: 'planDetail' });
    }
  }

  SDeliveryOrderDetails.init({
    delivery_order_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    delivery_plan_detail_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sent_qty: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    received_qty: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SDeliveryOrderDetails',
    tableName: 's_delivery_order_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SDeliveryOrderDetails;
};
