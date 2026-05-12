import { Model } from 'sequelize';

export default (sequelize, DataTypes) => {
  class SAreaLayout extends Model {
    static associate(models) {
      SAreaLayout.belongsTo(models.SWarehouseLayout, {
        foreignKey: 'wh_layout_id',
        as: 'warehouse_layout'
      });
      SAreaLayout.belongsTo(models.SWarehouseAreas, {
        foreignKey: 'area_id',
        as: 'area'
      });
      SAreaLayout.hasMany(models.SAreaSpacing, {
        foreignKey: 'area_layout_id',
        as: 'area_spacings'
      });
    }
  }

  SAreaLayout.init({
    wh_layout_id: {
      allowNull: false,
      type: DataTypes.INTEGER
    },
    area_id: {
      allowNull: false,
      type: DataTypes.INTEGER
    },
    start_row: {
      allowNull: false,
      type: DataTypes.INTEGER
    },
    start_col: {
      allowNull: false,
      type: DataTypes.INTEGER
    }
  }, {
    sequelize,
    modelName: 'SAreaLayout',
    tableName: 's_area_layouts',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SAreaLayout;
};