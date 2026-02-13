import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SWarehouses extends Model {
    static associate(models) {
      SWarehouses.belongsTo(models.SLines, { foreignKey: 'line_id' });
      SWarehouses.belongsTo(models.RefWarehouseCategories, { foreignKey: 'category_id', as: 'category' });
      SWarehouses.hasMany(models.SWarehouseAreas, { foreignKey: 'warehouse_id', as: 'areas' });
    }
  }

  SWarehouses.init({
    warehouse_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SWarehouses',
    tableName: 's_warehouses',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SWarehouses;
};
