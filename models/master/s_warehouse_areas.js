import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SWarehouseAreas extends Model {
    static associate(models) {
      SWarehouseAreas.belongsTo(models.SWarehouses, { foreignKey: 'warehouse_id', as: 'warehouse' });
      SWarehouseAreas.hasMany(models.SWarehouseBins, { foreignKey: 'area_id', as: 'bins' });
      SWarehouseAreas.hasMany(models.SDocks, { foreignKey: 'area_id', as: 'docks' });
    }
  }

  SWarehouseAreas.init({
    area_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    total_cols: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_rows: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    allowed_part_type_code: {
  type: DataTypes.STRING,
  allowNull: true
},
  }, {
    sequelize,
    modelName: 'SWarehouseAreas',
    tableName: 's_warehouse_areas',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SWarehouseAreas;
};
