import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionPlan extends Model {
    static associate(models) {
      SProductionPlan.hasMany(models.SProductionPlanDetail, { foreignKey: 'plan_id', as: 'details' });
      SProductionPlan.hasMany(models.SProductionPlanDoReference, { foreignKey: 'plan_id', as: 'do_references' });
      SProductionPlan.hasMany(models.SProductionPlanCapacityParam, { foreignKey: 'plan_id', as: 'capacity_params' });
      SProductionPlan.hasMany(models.SProductionPlanCapacityResult, { foreignKey: 'plan_id', as: 'capacity_results' });
      SProductionPlan.hasMany(models.SProductionPlanAdjustment, { foreignKey: 'plan_id', as: 'adjustments' });
      SProductionPlan.hasMany(models.SProductionOrder, { foreignKey: 'plan_id', as: 'production_orders' });
      SProductionPlan.belongsTo(models.SUsers, { foreignKey: 'created_by', as: 'creator' });
      SProductionPlan.belongsTo(models.SUsers, { foreignKey: 'approved_by', as: 'approver' });
      SProductionPlan.belongsTo(models.SUsers, { foreignKey: 'rejected_by', as: 'rejector' });
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
    total_products: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    total_qty_request: {
      type: DataTypes.INTEGER,
      defaultValue: 0
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
    }
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