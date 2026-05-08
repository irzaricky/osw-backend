import { Model } from 'sequelize';

export default (sequelize, DataTypes) => {
  class SWarehouseLayout extends Model {
    static associate(models) {
      SWarehouseLayout.belongsTo(models.SWarehouses, {
        foreignKey: 'warehouse_id',
        as: 'warehouse'
      });
      SWarehouseLayout.hasMany(models.SAreaLayout, {
        foreignKey: 'wh_layout_id',
        as: 'area_layouts'
      });
    }
  }

  SWarehouseLayout.init({
    warehouse_id: {
      allowNull: false,
      type: DataTypes.INTEGER,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'SWarehouseLayout',
    tableName: 's_warehouse_layouts',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SWarehouseLayout;
};