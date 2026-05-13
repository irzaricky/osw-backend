'use strict';
import {
  Model, DataTypes
} from 'sequelize';
export default (sequelize) => {
  class SMrp extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  SMrp.init({
    production_plan_id: DataTypes.INTEGER,
    number: DataTypes.STRING,
    description: DataTypes.STRING,
    status: DataTypes.STRING,
    created_by: DataTypes.INTEGER,
    approved_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'SMrp',
  });
  return SMrp;
};