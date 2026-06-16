import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TWorkOrderStoringItem extends Model {
    static associate(models) {
      TWorkOrderStoringItem.belongsTo(models.TWorkOrderStoring, {
        foreignKey: 'wo_id',
        as: 'work_order'
      });

      TWorkOrderStoringItem.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part'
      });

      TWorkOrderStoringItem.hasMany(models.TWorkOrderStoringItemLabel, {
        foreignKey: 'wo_item_id',
        as: 'item_labels'
      });
    }
  }

  TWorkOrderStoringItem.init({
    wo_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    buffer_used_qty_pcs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    buffer_added_qty_pcs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_kanban: {
      type: DataTypes.INTEGER,
      allowNull: false
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
    modelName: 'TWorkOrderStoringItem',
    tableName: 't_work_order_storing_item',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TWorkOrderStoringItem;
};