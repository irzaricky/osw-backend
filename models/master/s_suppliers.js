import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SSuppliers extends Model {
    static associate(models) {
      // Define associations here if needed
    }
  }

  SSuppliers.init({
    supplier_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SSuppliers',
    tableName: 's_suppliers',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SSuppliers;
};
