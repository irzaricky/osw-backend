import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TMaterialReceiving extends Model {
    static associate(models) {
      TMaterialReceiving.belongsTo(models.SMaterialDeliveryOrder, {
        foreignKey: 'mdo_id',
        as: 'mdo'
      });

      TMaterialReceiving.belongsTo(models.SUsers, {
        foreignKey: 'received_by',
        as: 'receiver'
      });

      TMaterialReceiving.belongsTo(models.RefReceivingStatus, {
        foreignKey: 'status_id',
        as: 'status'
      });

      TMaterialReceiving.hasMany(models.TMaterialReceivingItem, {
        foreignKey: 'mr_id',
        as: 'items'
      });

      TMaterialReceiving.hasMany(models.TWorkOrderStoring, {
        foreignKey: 'ref_doc_id',
        as: 'work_orders'
      });

      TMaterialReceiving.hasOne(models.TGoodReceipt, {
        foreignKey: 'mr_id',
        as: 'good_receipt'
      });
    }
  }

  TMaterialReceiving.init({
    mdo_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    received_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    received_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'TMaterialReceiving',
    tableName: 't_material_receiving',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TMaterialReceiving;
};