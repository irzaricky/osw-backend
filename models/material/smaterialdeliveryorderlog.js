'use strict';
import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SMaterialDeliveryOrderLog extends Model {
    static associate(models) {
      SMaterialDeliveryOrderLog.belongsTo(models.SMaterialDeliveryOrder, {
        foreignKey: 'mdo_id',
        as: 'mdo'
      });
      SMaterialDeliveryOrderLog.belongsTo(models.SUsers, {
        foreignKey: 'user_id',
        as: 'user'
      });
    }
  }

  SMaterialDeliveryOrderLog.init({
    mdo_id:  DataTypes.INTEGER,
    user_id: DataTypes.INTEGER,
    action:  DataTypes.STRING,   // 'created' | 'updated' | 'scheduled' | 'in_transit' | 'arrived' | 'cancelled' | 'rejected' | 'deleted'
    status:  DataTypes.STRING,   // snapshot status dokumen saat log dibuat
    notes:   DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'SMaterialDeliveryOrderLog',
    tableName: 's_material_delivery_order_logs',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SMaterialDeliveryOrderLog;
};