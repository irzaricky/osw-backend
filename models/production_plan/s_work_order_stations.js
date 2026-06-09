import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SWorkOrderStation extends Model {
    static associate(models) {
      SWorkOrderStation.belongsTo(models.SWorkOrder, { foreignKey: 'wo_id', as: 'work_order' });
      SWorkOrderStation.belongsTo(models.SStations, { foreignKey: 'station_id', as: 'station' });
    }
  }

  SWorkOrderStation.init({
    wo_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    station_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sequence: {
      type: DataTypes.INTEGER,
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
      defaultValue: 'Pending'
    },
    started_at: {
      type: DataTypes.DATE
    },
    completed_at: {
      type: DataTypes.DATE
    }
  }, {
    sequelize,
    modelName: 'SWorkOrderStation',
    tableName: 's_work_order_stations',
    underscored: true,
    timestamps: true,
    paranoid: false
  });

  return SWorkOrderStation;
};