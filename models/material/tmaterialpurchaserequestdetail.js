'use strict';
import {
  Model, DataTypes
} from 'sequelize';
export default (sequelize) => {
  class TMaterialPurchaseRequestDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  TMaterialPurchaseRequestDetail.init({
    mpr_id: DataTypes.INTEGER,
    part_id: DataTypes.INTEGER,
    qty: DataTypes.DECIMAL,
    required_date: DataTypes.DATEONLY,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'TMaterialPurchaseRequestDetail',
    tableName: 's_material_purchase_request_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });
  return TMaterialPurchaseRequestDetail;
};