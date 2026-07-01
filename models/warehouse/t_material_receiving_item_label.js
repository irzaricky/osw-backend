import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TMaterialReceivingItemLabel extends Model {
    static associate(models) {
      TMaterialReceivingItemLabel.belongsTo(models.TMaterialReceivingItem, {
        foreignKey: 'mr_item_id',
        as: 'material_receiving_item'
      });

      TMaterialReceivingItemLabel.belongsTo(models.TPartLabels, {
        foreignKey: 'label_id',
        as: 'label'
      });

      TMaterialReceivingItemLabel.hasOne(models.TNgTicket, {
        foreignKey: 'mr_item_label_id',
        as: 'ng_ticket'
      });

      TMaterialReceivingItemLabel.belongsTo(models.SUsers, {
        foreignKey: 'quantity_checked_by',
        as: 'quantity_checker'
      });

      TMaterialReceivingItemLabel.belongsTo(models.SUsers, {
        foreignKey: 'quality_checked_by',
        as: 'quality_checker'
      });
    }
  }

  TMaterialReceivingItemLabel.init({
    mr_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    label_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    is_quantity: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_quality: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    quantity_checked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    quantity_checked_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    quality_checked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    quality_checked_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'TMaterialReceivingItemLabel',
    tableName: 't_material_receiving_item_label',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TMaterialReceivingItemLabel;
};