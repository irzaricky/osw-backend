'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class SMrpDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  SMrpDetail.init({
    mrp_id: DataTypes.INTEGER,
    part_id: DataTypes.INTEGER,
    bom_id: DataTypes.INTEGER,
    qty: DataTypes.DECIMAL,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'SMrpDetail',
  });
  return SMrpDetail;
};