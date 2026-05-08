import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionOrderSchedule extends Model {
    static associate(models) {
      SProductionOrderSchedule.belongsTo(models.SProductionOrder, { foreignKey: 'po_id', as: 'production_order' });
      SProductionOrderSchedule.belongsTo(models.SProductionOrderProduct, { foreignKey: 'po_product_id', as: 'product' });
      SProductionOrderSchedule.belongsTo(models.SLine, { foreignKey: 'line_id', as: 'line' });
      SProductionOrderSchedule.belongsTo(models.SShift, { foreignKey: 'shift_id', as: 'shift' });
      SProductionOrderSchedule.belongsTo(models.SPart, { foreignKey: 'part_id', as: 'part' });
      SProductionOrderSchedule.hasMany(models.SWorkOrder, { foreignKey: 'po_schedule_id', as: 'work_orders' });
    }
  }

  SProductionOrderSchedule.init({
    po_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    po_product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    production_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    shift_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    planned_qty_per_day: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    actual_qty_per_day: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    line_capacity_per_day: {
      type: DataTypes.INTEGER
    },
    utilization_pct: {
      type: DataTypes.DECIMAL(5, 2)
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Scheduled'
    },
    notes: {
      type: DataTypes.TEXT
    }
  }, {
    sequelize,
    modelName: 'SProductionOrderSchedule',
    tableName: 's_production_order_schedules',
    underscored: true,
    timestamps: true,
    paranoid: false
  });

  return SProductionOrderSchedule;
};