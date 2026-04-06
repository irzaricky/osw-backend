import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SSalesForecasts extends Model {
    static associate(models) {
      SSalesForecasts.hasMany(models.SSalesForecastDetails, { foreignKey: 'forecast_id', as: 'details' });
      SSalesForecasts.hasMany(models.SSalesForecastLogs, { foreignKey: 'forecast_id', as: 'logs' });
      SSalesForecasts.hasMany(models.SSalesPurchaseRequests, { foreignKey: 'forecast_id', as: 'purchase_requests' });
      SSalesForecasts.belongsTo(models.SCustomers, { foreignKey: 'customer_id', as: 'customer' });
      SSalesForecasts.belongsTo(models.SUsers, { foreignKey: 'created_by', as: 'creator' });
      SSalesForecasts.belongsTo(models.SUsers, { foreignKey: 'approved_by', as: 'approver' });
    }
  }

  SSalesForecasts.init({
    forecast_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    forecast_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Yearly, Half-Year, 4-Month'
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    start_period: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_period: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      validate: {
        isAfterOrEqualStart(value) {
          if (this.start_period && new Date(value) < new Date(this.start_period)) {
            throw new Error('End period must be after or equal to start period');
          }
        }
      }
    },
    description: DataTypes.TEXT,
    version: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'V1'
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Draft'
    },
    copied_from_id: DataTypes.INTEGER,
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    approved_by: DataTypes.INTEGER,
    approved_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'SSalesForecasts',
    tableName: 's_sales_forecasts',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SSalesForecasts;
};
