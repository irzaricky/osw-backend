import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionPlanDoReference extends Model {
    static associate(models) {
      SProductionPlanDoReference.belongsTo(models.SProductionPlan, { foreignKey: 'plan_id', as: 'plan' });
      SProductionPlanDoReference.belongsTo(models.SDeliveryOrder, { foreignKey: 'do_id', as: 'delivery_order' });
    }
  }

  SProductionPlanDoReference.init({
    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    do_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'SProductionPlanDoReference',
    tableName: 's_production_plan_do_references',
    underscored: true,
    timestamps: true,
    updatedAt: false
  });

  return SProductionPlanDoReference;
};