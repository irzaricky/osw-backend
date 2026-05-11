'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class TMaterialPurchaseOrderDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  TMaterialPurchaseOrderDetail.init({
    mpo_id: DataTypes.INTEGER,
    part_id: DataTypes.INTEGER,
    qty: DataTypes.DECIMAL,
    price: DataTypes.DECIMAL,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'TMaterialPurchaseOrderDetail',
  });
  return TMaterialPurchaseOrderDetail;
};