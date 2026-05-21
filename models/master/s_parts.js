import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SParts extends Model {
    static associate(models) {
      // Parts can be parent to many BOMs (Both Products and Sub-assemblies)
      SParts.hasMany(models.SBoms, { foreignKey: 'parent_part_id', as: 'boms' });
      
      // Parts can be children in many different BOMs
      SParts.hasMany(models.SBomDetails, { foreignKey: 'part_id', as: 'bom_usages' });

      // Part belongs to Type
      SParts.belongsTo(models.RefPartTypes, { foreignKey: 'part_type_code', targetKey: 'code', as: 'type' });

      // Part belongs to Supplier
      SParts.belongsTo(models.SSuppliers, { foreignKey: 'supplier_id', as: 'supplier' });

      // Part belongs to Package
      SParts.belongsTo(models.SPackages, { foreignKey: 'package_id', as: 'package' });

      // Part belongs to UOM
      SParts.belongsTo(models.SUom, { foreignKey: 'uom_id', as: 'uom' });
      SParts.hasMany(models.SPartRoutings, { foreignKey: 'part_id', as: 'routings' });
    }
  }

  SParts.init({
    part_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    part_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    part_type_code: DataTypes.STRING,
    part_category: DataTypes.STRING,
    supplier_id: DataTypes.INTEGER,
    price: DataTypes.DECIMAL(15, 2),
    safety_stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lead_time_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    // Product fields
    model_name: DataTypes.STRING,
    model_code: DataTypes.STRING,
    generation: DataTypes.STRING,
    color: DataTypes.STRING,
    color_code: DataTypes.STRING,
    uom_id: { 
      type: DataTypes.INTEGER,
      allowNull: true
    },
    
    // Common
    package_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SParts',
    tableName: 's_parts',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SParts;
};
