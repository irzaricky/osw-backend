import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SSalesPurchaseRequests extends Model {
    static associate(models) {
      SSalesPurchaseRequests.belongsTo(models.SSalesForecasts, { foreignKey: 'forecast_id', as: 'forecast' });
      SSalesPurchaseRequests.belongsTo(models.SUsers, { foreignKey: 'created_by', as: 'creator' });
      SSalesPurchaseRequests.belongsTo(models.SUsers, { foreignKey: 'approved_by', as: 'approver' });
      SSalesPurchaseRequests.hasMany(models.SSalesPurchaseRequestDetails, { foreignKey: 'spr_id', as: 'details' });
      SSalesPurchaseRequests.hasMany(models.SSalesPurchaseOrders, { foreignKey: 'spr_id', as: 'orders' });
    }
  }

  SSalesPurchaseRequests.init({
    spr_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    spr_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    forecast_id: DataTypes.INTEGER,
    request_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    required_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    confirmed_date: DataTypes.DATEONLY,
    description: DataTypes.TEXT,
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Draft'
    },
    remarks: DataTypes.TEXT,
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    approved_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'SSalesPurchaseRequests',
    tableName: 's_sales_purchase_requests',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SSalesPurchaseRequests;
};
