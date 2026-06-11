import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SParts extends Model {
    static associate(models) {
      SParts.hasMany(models.SBoms, { foreignKey: 'parent_part_id', as: 'boms' });
      SParts.hasMany(models.SBomDetails, { foreignKey: 'part_id', as: 'bom_usages' });
      SParts.belongsTo(models.RefPartTypes, { foreignKey: 'part_type_code', targetKey: 'code', as: 'type' });
      SParts.belongsTo(models.SSuppliers, { foreignKey: 'supplier_id', as: 'supplier' });
      SParts.belongsTo(models.SPackages, { foreignKey: 'package_id', as: 'package' });
      SParts.belongsTo(models.SUom, { foreignKey: 'uom_id', as: 'uom' });
      SParts.hasMany(models.SPartRoutings, { foreignKey: 'part_id', as: 'routings' });
      SParts.hasMany(models.SPartSuppliers, { foreignKey: 'part_id', as: 'part_suppliers' });
      SParts.belongsToMany(models.SSuppliers, {
        through: models.SPartSuppliers,
        foreignKey: 'part_id',
        otherKey: 'supplier_id',
        as: 'suppliers',
      });
    }
  }

  SParts.init({
    part_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    part_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    part_type_code: DataTypes.STRING,
    part_category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    supplier_id: DataTypes.INTEGER,
    price: DataTypes.DECIMAL(15, 2),
    safety_stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    lead_time_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    // Product fields
    model_name: DataTypes.STRING,
    model_code: DataTypes.STRING,
    generation: DataTypes.STRING,
    color: DataTypes.STRING,
    color_code: DataTypes.STRING,
    uom_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // Common
    package_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    /**
     * Berat per unit dalam kilogram (kg).
     * Wajib diisi agar sistem bisa menghitung apakah muatan melebihi
     * kapasitas kendaraan (load_capacity di ref_vehicle_types).
     * NULL berarti berat belum dikonfigurasi — part tersebut akan
     * dianggap berbobot 0 saat preview split, dengan warning di response.
     */
    weight: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: true,
      defaultValue: null,
      comment: 'Berat per unit dalam kilogram (kg)',
    },
    min_qty_sell: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    standard_buffer_stock: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    weight_per_pcs: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'SParts',
    tableName: 's_parts',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
  });

  return SParts;
};