import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SWorkOrderIssue extends Model {
    static associate(models) {
      SWorkOrderIssue.belongsTo(models.SWorkOrder, { foreignKey: 'wo_id', as: 'work_order' });
    }
  }

  SWorkOrderIssue.init({
    wo_id: {
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
      type: DataTypes.STRING(100)
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
      type: DataTypes.STRING(100)
    },
    resolved_time: {
      type: DataTypes.DATE
    }
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