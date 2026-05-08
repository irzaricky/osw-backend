import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SDeliveryPlanDetails extends Model {
    static associate(models) {
      SDeliveryPlanDetails.belongsTo(models.SDeliveryPlans, { foreignKey: 'delivery_plan_id', as: 'deliveryPlan' });
      SDeliveryPlanDetails.belongsTo(models.SSalesPurchaseOrderDetails, { foreignKey: 'spo_detail_id', as: 'spoDetail' });
      SDeliveryPlanDetails.hasMany(models.SDeliveryOrderDetails, { foreignKey: 'delivery_plan_detail_id', as: 'doDetails' });
    }
  }

  SDeliveryPlanDetails.init({
    delivery_plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    spo_detail_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    planned_qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'SDeliveryPlanDetails',
    tableName: 's_delivery_plan_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SDeliveryPlanDetails;
};
