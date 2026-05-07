import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SSalesForecastDetails extends Model {
    static associate(models) {
      SSalesForecastDetails.belongsTo(models.SSalesForecasts, { foreignKey: 'forecast_id', as: 'forecast' });
      SSalesForecastDetails.belongsTo(models.SParts, { foreignKey: 'part_id', as: 'part' });
    }
  }

  SSalesForecastDetails.init({
    forecast_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    forecast_detail_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    period_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    qty_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'Temporary',
      comment: 'Fix, Temporary'
    },
    forecast_qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    }
  }, {
    sequelize,
    modelName: 'SSalesForecastDetails',
    tableName: 's_sales_forecast_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SSalesForecastDetails;
};
