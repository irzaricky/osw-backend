import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SSalesForecastLogs extends Model {
    static associate(models) {
      // Log belongs to Forecast
      SSalesForecastLogs.belongsTo(models.SSalesForecasts, { foreignKey: 'forecast_id', as: 'forecast' });
      
      // Log belongs to User
      SSalesForecastLogs.belongsTo(models.SUsers, { foreignKey: 'changed_by', as: 'user' });
    }
  }

  SSalesForecastLogs.init({
    forecast_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    version: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    total_qty: {
      type: DataTypes.INTEGER
    },
    action: {
      type: DataTypes.STRING(50)
    },
    remarks: {
      type: DataTypes.TEXT
    },
    changed_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    details_snapshot: {
      type: DataTypes.JSON
    }
  }, {
    sequelize,
    modelName: 'SSalesForecastLogs',
    tableName: 's_sales_forecast_logs',
    underscored: true,
    timestamps: true,
    updatedAt: false,
    paranoid: false
  });

  return SSalesForecastLogs;
};
