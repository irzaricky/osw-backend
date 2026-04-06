import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SSalesPurchaseRequestDetails extends Model {
    static associate(models) {
      SSalesPurchaseRequestDetails.belongsTo(models.SSalesPurchaseRequests, { foreignKey: 'spr_id', as: 'spr' });
      SSalesPurchaseRequestDetails.belongsTo(models.SParts, { foreignKey: 'part_id', as: 'part' });
    }
  }

  SSalesPurchaseRequestDetails.init({
    spr_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    }
  }, {
    sequelize,
    modelName: 'SSalesPurchaseRequestDetails',
    tableName: 's_sales_purchase_request_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SSalesPurchaseRequestDetails;
};
