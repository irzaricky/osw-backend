import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefWarehouseCategories extends Model {
    static associate(models) {
      RefWarehouseCategories.hasMany(models.SWarehouses, { foreignKey: 'category_id' });
    }
  }

  RefWarehouseCategories.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'RefWarehouseCategories',
    tableName: 'ref_warehouse_categories',
    underscored: true,
    timestamps: true
  });

  return RefWarehouseCategories;
};
