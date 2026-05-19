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

      TWarehouseStockLog.belongsTo(models.SWorkOrder, {
        foreignKey: 'wo_id',
        as: 'work_order'
      });

      TWarehouseStockLog.belongsTo(models.TWorkOrderStoringItemLabel, {
        foreignKey: 'wo_item_label_id',
        as: 'work_order_item_label'
      });

      TWarehouseStockLog.belongsTo(models.TPartLabels, {
        foreignKey: 'label_id',
        as: 'label'
      });

      TWarehouseStockLog.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part'
      });

      TWarehouseStockLog.belongsTo(models.SWarehouseBins, {
        foreignKey: 'bin_id',
        as: 'bin'
      });

      TWarehouseStockLog.belongsTo(models.TPartLabels, {
        foreignKey: 'recommended_label_id',
        as: 'recommended_label_ref'
      });
    }
  }

  TWarehouseStockLog.init({
    wh_stock_id: {
      type: DataTypes.INTEGER,
      allowNull: true
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
    },
    selected_label: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    fifo_override: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    recommended_label: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    wo_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    wo_item_label_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    label_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    bin_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    recommended_label_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    recommended_label_number: {
      type: DataTypes.STRING(255),
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