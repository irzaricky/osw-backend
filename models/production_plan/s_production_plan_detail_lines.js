import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionPlanDetailLine extends Model {
    static associate(models) {
         SProductionPlanDetailLine.belongsTo(models.SProductionPlanDetail, {
          foreignKey: 'plan_detail_id',
          as: 'plan_detail',
        });
    
        SProductionPlanDetailLine.belongsTo(models.SLines, {
          foreignKey: 'line_id',
          as: 'line',
        });
    }
  }

  SProductionPlanDetailLine.init({
    /* SProductionPlanDetailLine,   // NEW: pivot table (plan_detail_id, line_id, sequence, qty_capacity, capacity_gap, status)
     */
    plan_detail_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 's_production_plan_details',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 's_lines',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    qty_capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    capacity_gap: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Not_Calculated'
    }
  }, {
    sequelize,
    modelName: 'SProductionPlanDetailLine',
    tableName: 's_production_plan_detail_lines',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SProductionPlanDetailLine;
};