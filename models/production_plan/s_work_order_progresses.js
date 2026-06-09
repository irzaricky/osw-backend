import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SWorkOrderProgress extends Model {
    static associate(models) {
      SWorkOrderProgress.belongsTo(models.SWorkOrder, { foreignKey: 'wo_id', as: 'work_order' });
    }
  }

  SWorkOrderProgress.init({
    wo_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    progress_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    cumulative_qty: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    progress_pct: {
      type: DataTypes.DECIMAL(5, 2)
    },
    reported_by: {
      type: DataTypes.INTEGER
    },
    qty_good: {
      type: DataTypes.INTEGER
    },
    qty_reject: {
      type: DataTypes.INTEGER
    },
    qty_scrap: {
      type: DataTypes.INTEGER
    },
    cumulative_qty_good: {
      type: DataTypes.INTEGER
    },
    reported_at: {
      type: DataTypes.DATE,
    }
  }, {
    sequelize,
    modelName: 'SWorkOrderProgress',
    tableName: 's_work_order_progresses',
    underscored: true,
    timestamps: true,
    updatedAt: false,
    paranoid: false
  });

  return SWorkOrderProgress;
};