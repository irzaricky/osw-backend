import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionOrder extends Model {
    static associate(models) {
      SProductionOrder.belongsTo(models.SProductionPlan, { foreignKey: 'plan_id', as: 'plan' });
      SProductionOrder.hasMany(models.SProductionOrderProduct, { foreignKey: 'po_id', as: 'products' });
      SProductionOrder.hasMany(models.SProductionOrderSchedule, { foreignKey: 'po_id', as: 'schedules' });
      SProductionOrder.hasMany(models.SProductionOrderRescheduleLog, { foreignKey: 'po_id', as: 'reschedule_logs' });
      SProductionOrder.hasMany(models.SWorkOrder, { foreignKey: 'po_id', as: 'work_orders' });
    }
  }

  SProductionOrder.init({
    po_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    production_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    production_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    earliest_delivery_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    latest_delivery_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    priority: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'Medium'
    },
    po_description: {
      type: DataTypes.TEXT
    },
    total_products: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_planned_qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_scheduled_qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_actual_qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Draft'
    },
    notes: {
      type: DataTypes.TEXT
    },
    created_by: {
      type: DataTypes.STRING(100)
    },
    released_by: {
      type: DataTypes.STRING(100)
    },
    released_at: {
      type: DataTypes.DATE
    },
    rejected_by: {
      type: DataTypes.STRING(100)
    },
    rejected_at: {
      type: DataTypes.DATE
    },
    completed_at: {
      type: DataTypes.DATE
    },
    closed_at: {
      type: DataTypes.DATE
    },
    cancelled_by: {
      type: DataTypes.STRING(100)
    },
    cancelled_at: {
      type: DataTypes.DATE
    }
  }, {
    sequelize,
    modelName: 'SProductionOrder',
    tableName: 's_production_orders',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SProductionOrder;
};