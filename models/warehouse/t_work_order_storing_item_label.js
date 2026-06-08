import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TWorkOrderStoringItemLabel extends Model {
    static associate(models) {
      TWorkOrderStoringItemLabel.belongsTo(models.TWorkOrderStoringItem, {
        foreignKey: 'wo_item_id',
        as: 'work_order_item'
      });

      TWorkOrderStoringItemLabel.belongsTo(models.TPartLabels, {
        foreignKey: 'label_id',
        as: 'label'
      });
    }
  }

  TWorkOrderStoringItemLabel.init({
    wo_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    label_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    is_scanned_in: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_scanned_out: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    sequelize,
    modelName: 'TWorkOrderStoringItemLabel',
    tableName: 't_work_order_storing_item_label',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TWorkOrderStoringItemLabel;
};