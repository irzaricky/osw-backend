import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionPlanCapacityParam extends Model {
    static associate(models) {
      SProductionPlanCapacityParam.belongsTo(models.SProductionPlan, { foreignKey: 'plan_id', as: 'plan' });
      SProductionPlanCapacityParam.belongsTo(models.SLines, { foreignKey: 'line_id', as: 'line' });
    }
  }

  SProductionPlanCapacityParam.init({
    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    param_type: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    working_days: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    shifts_per_day: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    working_hours_per_shift: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false
    },
    manpower: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    efficiency_factor: {
      type: DataTypes.DECIMAL(5, 4),
      defaultValue: 0.85
    },
    overtime_hours: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'SProductionPlanCapacityParam',
    tableName: 's_production_plan_capacity_params',
    underscored: true,
    timestamps: true,
    paranoid: false
  });

  return SProductionPlanCapacityParam;
};