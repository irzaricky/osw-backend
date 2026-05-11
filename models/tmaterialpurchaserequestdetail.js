'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
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
  });
  return TMaterialPurchaseRequestDetail;
};