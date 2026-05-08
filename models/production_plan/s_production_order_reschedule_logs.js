import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionOrderRescheduleLog extends Model {
    static associate(models) {
      SProductionOrderRescheduleLog.belongsTo(models.SProductionOrder, { foreignKey: 'po_id', as: 'production_order' });
    }
  }

  SProductionOrderRescheduleLog.init({
    po_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    old_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    old_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    new_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    new_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    reschedule_reason: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    impacted_wo_count: {
      type: DataTypes.INTEGER
    },
    rescheduled_by: {
      type: DataTypes.STRING(100)
    },
    rescheduled_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'SProductionOrderRescheduleLog',
    tableName: 's_production_order_reschedule_logs',
    underscored: true,
    timestamps: false
  });

  return SProductionOrderRescheduleLog;
};