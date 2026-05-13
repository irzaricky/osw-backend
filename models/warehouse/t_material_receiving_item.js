import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TMaterialReceivingItem extends Model {
    static associate(models) {
      TMaterialReceivingItem.belongsTo(models.TMaterialReceiving, {
        foreignKey: 'mr_id',
        as: 'material_receiving'
      });

      TMaterialReceivingItem.belongsTo(models.TMaterialDeliveryOrderDetail, {
        foreignKey: 'mdo_detail_id',
        as: 'mdo_detail'
      });

      TMaterialReceivingItem.hasMany(models.TMaterialReceivingItemLabel, {
        foreignKey: 'mr_item_id',
        as: 'labels'
      });
    }
  }

  TMaterialReceivingItem.init({
    mr_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    mdo_detail_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    quantity_checked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    quantity_checked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    quality_checked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    quality_checked_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'TMaterialReceivingItem',
    tableName: 't_material_receiving_item',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TMaterialReceivingItem;
};