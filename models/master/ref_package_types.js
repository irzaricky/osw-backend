import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefPackageTypes extends Model {
    static associate(models) {
      RefPackageTypes.hasMany(models.SPackages, { foreignKey: 'package_type_id', as: 'packages' });
    }
  }

  RefPackageTypes.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'RefPackageTypes',
    tableName: 'ref_package_types',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefPackageTypes;
};
