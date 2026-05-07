import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SDeliveryPlans extends Model {
    static associate(models) {
      SDeliveryPlans.belongsTo(models.SWarehouses, { foreignKey: 'warehouse_id', as: 'warehouse' });
      SDeliveryPlans.belongsTo(models.SDocks, { foreignKey: 'dock_id', as: 'dock' });
      SDeliveryPlans.belongsTo(models.SUsers, { foreignKey: 'created_by', as: 'creator' });
      SDeliveryPlans.hasMany(models.SDeliveryPlanDetails, { foreignKey: 'delivery_plan_id', as: 'details' });
      SDeliveryPlans.hasMany(models.SDeliveryOrders, { foreignKey: 'delivery_plan_id', as: 'deliveryOrders' });
    }
  }

  SDeliveryPlans.init({
    dp_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    scheduled_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    time_start: {
      type: DataTypes.TIME,
      allowNull: false
    },
    time_end: {
      type: DataTypes.TIME,
      allowNull: false
    },
    warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    dock_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    destination: {
      type: DataTypes.TEXT,
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
    modelName: 'SDeliveryPlans',
    tableName: 's_delivery_plans',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SDeliveryPlans;
};
