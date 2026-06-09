import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionPlan extends Model {
    static associate(models) {
      SProductionPlan.hasMany(models.SProductionPlanDetail, { foreignKey: 'plan_id', as: 'details' });
      SProductionPlan.hasMany(models.SProductionPlanCapacityParam, { foreignKey: 'plan_id', as: 'capacity_params' });
      SProductionPlan.hasMany(models.SProductionPlanCapacityResult, { foreignKey: 'plan_id', as: 'capacity_results' });
      SProductionPlan.hasMany(models.SProductionOrder, { foreignKey: 'plan_id', as: 'production_orders' });
      SProductionPlan.belongsTo(models.SUsers, { foreignKey: 'created_by', as: 'creator' });
      SProductionPlan.belongsTo(models.SUsers, { foreignKey: 'approved_by', as: 'approver' });
      SProductionPlan.belongsTo(models.SUsers, { foreignKey: 'rejected_by', as: 'rejector' });
      SProductionPlan.belongsTo(models.SLines, { foreignKey: 'bottleneck_line_id', as: 'bottleneck_line' });
      SProductionPlan.belongsTo(models.SProductionPlan, { foreignKey: 'parent_plan_id', as: 'parent_plan' });
    }
  }

  SProductionPlan.init({
    plan_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    plan_description: {
      type: DataTypes.TEXT
    },
    earliest_delivery_date: {
      type: DataTypes.DATEONLY
    },
    latest_delivery_date: {
      type: DataTypes.DATEONLY
    },
    total_qty_capacity: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    overall_status: {
      type: DataTypes.STRING(50),
      defaultValue: 'Not_Calculated'
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'Draft'
    },
    notes: {
      type: DataTypes.TEXT
    },
    created_by: {
      type: DataTypes.INTEGER,
        allowNull: false
    },
    approved_by: {
      type: DataTypes.INTEGER,
    },
    approved_at: {
      type: DataTypes.DATE
    },
    approval_notes: {
      type: DataTypes.TEXT
    },
    rejected_by: {
      type: DataTypes.INTEGER,
    },
    rejected_at: {
      type: DataTypes.DATE
    },
    rejection_reason: {
      type: DataTypes.TEXT
    },
    bottleneck_line_id: {
      type: DataTypes.INTEGER,
    },
    plan_month: {
      type: DataTypes.STRING(7),
      allowNull: false,
    },
    plan_type: {
      type: DataTypes.ENUM('ORIGINAL', 'AMENDMENT'),
      allowNull: false,
      defaultValue: 'ORIGINAL',
    },
    parent_plan_id: {
      type: DataTypes.INTEGER,
    },
  }, {
    sequelize,
    modelName: 'SProductionPlan',
    tableName: 's_production_plans',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SProductionPlan;
};