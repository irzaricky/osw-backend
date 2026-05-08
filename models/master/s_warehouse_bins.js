import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SWarehouseBins extends Model {
    static associate(models) {
      SWarehouseBins.belongsTo(models.SWarehouseAreas, { foreignKey: 'area_id', as: 'area' });
      SWarehouseBins.hasMany(models.TWarehouseStock, { foreignKey: 'bin_id', as: 'stocks' });
    }
  }

  SWarehouseBins.init({
    bin_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    area_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    row_index: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    col_index: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    is_dedicated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    dedicated_part_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'SWarehouseBins',
    tableName: 's_warehouse_bins',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SWarehouseBins;
};
