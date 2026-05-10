import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SSalesPurchaseRequestLogs extends Model {
    static associate(models) {
      SSalesPurchaseRequestLogs.belongsTo(models.SSalesPurchaseRequests, { foreignKey: 'spr_id', as: 'spr' });
      SSalesPurchaseRequestLogs.belongsTo(models.SUsers, { foreignKey: 'changed_by', as: 'user' });
    }
  }

  SSalesPurchaseRequestLogs.init({
    spr_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    remarks: DataTypes.TEXT,
    changed_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'SSalesPurchaseRequestLogs',
    tableName: 's_sales_purchase_request_logs',
    underscored: true,
    timestamps: true
  });

  return SSalesPurchaseRequestLogs;
};
