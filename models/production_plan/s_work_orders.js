import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SWorkOrder extends Model {
    static associate(models) {
      SWorkOrder.belongsTo(models.SProductionOrder, { foreignKey: 'po_id', as: 'production_order' });
      SWorkOrder.belongsTo(models.SProductionOrderSchedule, { foreignKey: 'po_schedule_id', as: 'schedule' });
      SWorkOrder.belongsTo(models.SPart, { foreignKey: 'part_id', as: 'part' });
      SWorkOrder.belongsTo(models.SLine, { foreignKey: 'line_id', as: 'line' });
      SWorkOrder.belongsTo(models.SFactory, { foreignKey: 'factory_id', as: 'factory' });
      SWorkOrder.belongsTo(models.SShift, { foreignKey: 'shift_id', as: 'shift' });
      SWorkOrder.hasMany(models.SWorkOrderStation, { foreignKey: 'wo_id', as: 'stations' });
      SWorkOrder.hasMany(models.SWorkOrderProgress, { foreignKey: 'wo_id', as: 'progresses' });
      SWorkOrder.hasMany(models.SWorkOrderIssue, { foreignKey: 'wo_id', as: 'issues' });
    }
  }

  SWorkOrder.init({
    wo_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    po_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    po_schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    factory_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    shift_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    work_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    planned_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    actual_quantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Released'
    },
    supervisor: {
      type: DataTypes.STRING(100)
    }
  }, {
    sequelize,
    modelName: 'SWorkOrder',
    tableName: 's_work_orders',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SWorkOrder;
};