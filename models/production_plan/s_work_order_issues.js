import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SWorkOrderIssue extends Model {
    static associate(models) {
      SWorkOrderIssue.belongsTo(models.SWorkOrderStation, { foreignKey: 'wo_station_id', as: 'work_order_station' });
      SWorkOrderIssue.belongsTo(models.SUsers, { foreignKey: 'reported_by', as: 'reporter' });
      SWorkOrderIssue.belongsTo(models.SUsers, { foreignKey: 'resolved_by', as: 'resolver' });
      SWorkOrderIssue.belongsTo(models.SUsers, { foreignKey: 'paused_by', as: 'pauser' });
      SWorkOrderIssue.belongsTo(models.SUsers, { foreignKey: 'resumed_by', as: 'resumer' });
    }
  }

  SWorkOrderIssue.init({
    wo_station_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    issue_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    issue_description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    downtime_start: {
      type: DataTypes.DATE
    },
    downtime_end: {
      type: DataTypes.DATE
    },
    downtime_minutes: {
      type: DataTypes.INTEGER
    },
    defect_qty: {
      type: DataTypes.INTEGER
    },
    defect_type: {
      type: DataTypes.STRING(100)
    },
    reported_by: {
      type: DataTypes.INTEGER
    },
    reported_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    resolution: {
      type: DataTypes.TEXT
    },
    resolved_by: {
      type: DataTypes.INTEGER
    },
    resolved_time: {
      type: DataTypes.DATE
    },
    severity: {
      type: DataTypes.STRING(20)
    },
    pause_reason: {
      type: DataTypes.STRING(100)
    },
    paused_by: {
      type: DataTypes.INTEGER
    },
    paused_at: {
      type: DataTypes.DATE
    },
    resumed_by: {
      type: DataTypes.INTEGER
    },
    resumed_at: {
      type: DataTypes.DATE
    },
    pause_duration_minutes: {
      type: DataTypes.INTEGER
    },
    shift_end_qty: {
      type: DataTypes.INTEGER
    },
  }, {
    sequelize,
    modelName: 'SWorkOrderIssue',
    tableName: 's_work_order_issues',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SWorkOrderIssue;
};