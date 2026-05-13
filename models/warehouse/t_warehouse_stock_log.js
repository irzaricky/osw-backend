import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TWarehouseStockLog extends Model {
    static associate(models) {
      TWarehouseStockLog.belongsTo(models.TWarehouseStock, {
        foreignKey: 'wh_stock_id',
        as: 'warehouse_stock'
      });

      TWarehouseStockLog.belongsTo(models.SUsers, {
        foreignKey: 'user_id',
        as: 'user'
      });
    }
  }

  TWarehouseStockLog.init({
    wh_stock_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    is_placement: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    qty_per_kanban: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    old_data: {
  type: DataTypes.JSONB,
  allowNull: true
}
  }, {
    sequelize,
    modelName: 'TWarehouseStockLog',
    tableName: 't_warehouse_stock_log',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TWarehouseStockLog;
};