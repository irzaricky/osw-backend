import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SPackages extends Model {
    static associate(models) {
      SPackages.belongsTo(models.RefPackageTypes, { foreignKey: 'package_type_id', as: 'package_type' });
    }
  }

  SPackages.init({
    package_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    package_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    load: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SPackages',
    tableName: 's_packages',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SPackages;
};
