'use strict';
import {
  Model, DataTypes
} from 'sequelize';
export default (sequelize) => {
  class SMaterialPurchaseOrderLog extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  SMaterialPurchaseOrderLog.init({
    mpo_id: DataTypes.INTEGER,
    action: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'SMaterialPurchaseOrderLog',
  });
  return SMaterialPurchaseOrderLog;
};