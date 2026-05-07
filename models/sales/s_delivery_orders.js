import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SDeliveryOrders extends Model {
    static associate(models) {
      SDeliveryOrders.belongsTo(models.SDeliveryPlans, { foreignKey: 'delivery_plan_id', as: 'deliveryPlan' });
      SDeliveryOrders.belongsTo(models.SCustomers, { foreignKey: 'customer_id', as: 'customer' });
      SDeliveryOrders.belongsTo(models.SVehicles, { foreignKey: 'vehicle_id', as: 'vehicle' });
      SDeliveryOrders.belongsTo(models.SUserDetail, { foreignKey: 'driver_id', targetKey: 'user_id', as: 'driver' });
      SDeliveryOrders.belongsTo(models.SUsers, { foreignKey: 'created_by', as: 'creator' });
    }
  }

  SDeliveryOrders.init({
    do_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    delivery_plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    vehicle_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    driver_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    shipment_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    delivery_status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'In Transit'
    },
    proof_of_delivery: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'SDeliveryOrders',
    tableName: 's_delivery_orders',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SDeliveryOrders;
};
