import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TWarehouseStock extends Model {
    static associate(models) {
      TWarehouseStock.belongsTo(models.TWorkOrderStoringItemLabel, {
        foreignKey: 'wo_item_label_id',
        as: 'work_order_item_label'
      });

      TWarehouseStock.belongsTo(models.SWarehouseBins, {
        foreignKey: 'bin_id',
        as: 'bin'
      });

      TWarehouseStock.hasMany(models.TWarehouseStockLog, {
        foreignKey: 'wh_stock_id',
        as: 'logs'
      });
    }
  }

  TWarehouseStock.init({
    wo_item_label_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
    },
    bin_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'TWarehouseStock',
    tableName: 't_warehouse_stock',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TWarehouseStock;
};