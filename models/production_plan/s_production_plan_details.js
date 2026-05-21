import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionPlanDetail extends Model {
    static associate(models) {
      SProductionPlanDetail.belongsTo(models.SProductionPlan, { foreignKey: 'plan_id', as: 'plan' });
      SProductionPlanDetail.belongsTo(models.SDeliveryOrders, { foreignKey: 'do_id', as: 'delivery_order' });
      SProductionPlanDetail.belongsTo(models.SDeliveryOrderDetails, { foreignKey: 'do_detail_id', as: 'delivery_order_detail' });
      SProductionPlanDetail.belongsTo(models.SCustomers, { foreignKey: 'customer_id', as: 'customer' });
      SProductionPlanDetail.belongsTo(models.SParts, { foreignKey: 'part_id', as: 'part' });
      SProductionPlanDetail.hasMany(models.SProductionOrderProduct, { foreignKey: 'plan_detail_id', as: 'production_order_products' });
      SProductionPlanDetail.belongsTo(models.SPartRoutings, { foreignKey: 'routing_id', as: 'routing' });
      SProductionPlanDetail.belongsTo(models.SLines, { foreignKey: 'assigned_line_id', as: 'assigned_line' });
      SProductionPlanDetail.hasMany(models.SProductionPlanDetailLine, { foreignKey: 'plan_detail_id', as: 'detail_lines' });
    }
  }

  SProductionPlanDetail.init({
    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sequence: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    do_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    do_detail_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    delivery_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    qty_request: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    qty_capacity: {
      type: DataTypes.INTEGER
    },
    capacity_gap: {
      type: DataTypes.INTEGER
    },
    status: {
      type: DataTypes.STRING(50)
    },
    notes: {
      type: DataTypes.TEXT
    },
    routing_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    assigned_line_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    required_minutes: {
      type: DataTypes.DECIMAL(15,2),
      defaultValue: 0
    },
    priority_level: {
      type: DataTypes.STRING(20)
    },
    priority_score: {
      type: DataTypes.DECIMAL(10,2),
      defaultValue: 0
    },
  }, {
    sequelize,
    modelName: 'SProductionPlanDetail',
    tableName: 's_production_plan_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SProductionPlanDetail;
};