'use strict';
import {
  Model, DataTypes
} from 'sequelize';
export default (sequelize) => {
  class SMaterialDeliveryOrder extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      SMaterialDeliveryOrder.hasOne(models.TMaterialReceiving, { foreignKey: 'mdo_id', as: 'material_receiving' });
    }
  }
  SMaterialDeliveryOrder.init({
    mpo_id: DataTypes.INTEGER,
    dock_id: DataTypes.INTEGER,
    number: DataTypes.STRING,
    description: DataTypes.STRING,
    target_date: DataTypes.DATEONLY,
    transporter: DataTypes.STRING,
    status: DataTypes.STRING,
    remarks: DataTypes.TEXT,
    created_by: DataTypes.INTEGER,
    approved_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'SMaterialDeliveryOrder',
  });
  return SMaterialDeliveryOrder;
};