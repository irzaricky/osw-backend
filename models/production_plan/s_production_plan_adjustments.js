import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionPlanAdjustment extends Model {
    static associate(models) {
      SProductionPlanAdjustment.belongsTo(models.SProductionPlan, { foreignKey: 'plan_id', as: 'plan' });
      SProductionPlanAdjustment.belongsTo(models.SLines, { foreignKey: 'line_id', as: 'line' });
    }
  }

  SProductionPlanAdjustment.init({
    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    adjustment_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    adjustment_description: {
      type: DataTypes.TEXT
    },
    sequence: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    base_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    adjusted_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    difference: {
      type: DataTypes.DECIMAL(10, 2)
    },
    capacity_impact_minutes: {
      type: DataTypes.DECIMAL(15, 2)
    },
    created_by: {
      type: DataTypes.STRING(100)
    }
  }, {
    sequelize,
    modelName: 'SProductionPlanAdjustment',
    tableName: 's_production_plan_adjustments',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SProductionPlanAdjustment;
};