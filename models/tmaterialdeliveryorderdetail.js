'use strict';
import {
  Model, DataTypes
} from 'sequelize';
export default (sequelize) => {
  class TMaterialDeliveryOrderDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  TMaterialDeliveryOrderDetail.init({
    mdo_id: DataTypes.INTEGER,
    part_id: DataTypes.INTEGER,
    qty: DataTypes.DECIMAL,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'TMaterialDeliveryOrderDetail',
  });
  return TMaterialDeliveryOrderDetail;
};