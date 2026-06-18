import { Model, DataTypes } from "sequelize";

export default (sequelize) => {
  class SProductionPlanCalendarAdjustment extends Model {
    static associate(models) {
      SProductionPlanCalendarAdjustment.belongsTo(models.SProductionPlan, { foreignKey: 'plan_id', as: 'plan' });
      SProductionPlanCalendarAdjustment.belongsTo(models.SShifts, { foreignKey: 'shift_id', as: 'shift' });
      SProductionPlanCalendarAdjustment.belongsTo(models.SProductionPlan, { foreignKey: 'inherited_from_plan', as: 'parent_plan' });
    }
  }

  SProductionPlanCalendarAdjustment.init({
    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    adjustment_type: {
      type: DataTypes.ENUM('ADD_WORKING_DAY', 'ADD_SHIFT', 'ADD_OVERTIME'),
      allowNull: false
    },
    shift_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    overtime_minutes: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    reason: {
      type: DataTypes.TEXT
    },
    inherited_from_plan: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SProductionPlanCalendarAdjustment',
    tableName: 's_production_plan_calendar_adjustments',
    timestamps: true,
    underscored: true
  });

  return SProductionPlanCalendarAdjustment;
}