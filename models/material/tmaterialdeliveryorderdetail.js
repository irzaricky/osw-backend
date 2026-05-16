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
      TMaterialDeliveryOrderDetail.belongsTo(models.SParts, { foreignKey: 'part_id', as: 'part' });
      TMaterialDeliveryOrderDetail.hasOne(models.TMaterialReceivingItem, { foreignKey: 'mdo_detail_id', as: 'material_receiving_item' });
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
    tableName: 's_material_delivery_order_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });
  return TMaterialDeliveryOrderDetail;
};