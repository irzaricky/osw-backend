import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionPlanCapacityResult extends Model {
    static associate(models) {
      SProductionPlanCapacityResult.belongsTo(models.SProductionPlan, { foreignKey: 'plan_id', as: 'plan' });
      SProductionPlanCapacityResult.belongsTo(models.SLines, { foreignKey: 'line_id', as: 'line' });
    }
  }

  SProductionPlanCapacityResult.init({
    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    max_takt_time: {
      type: DataTypes.INTEGER
    },
    capacity_per_hour: {
      type: DataTypes.DECIMAL(10, 2)
    },
    capacity_gap_units: {
      type: DataTypes.DECIMAL(15, 2)
    },
    utilization_pct: {
      type: DataTypes.DECIMAL(5, 2)
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    calculated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    total_capacity_units: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
  }, {
    sequelize,
    modelName: 'SProductionPlanCapacityResult',
    tableName: 's_production_plan_capacity_results',
    underscored: true,
    timestamps: false
  });

  return SProductionPlanCapacityResult;
};