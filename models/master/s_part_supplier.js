import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SPartSuppliers extends Model {
    static associate(models) {
      SPartSuppliers.belongsTo(models.SParts, { foreignKey: 'part_id', as: 'part' });
      SPartSuppliers.belongsTo(models.SSuppliers, { foreignKey: 'supplier_id', as: 'supplier' });
    }
  }

  SPartSuppliers.init(
    {
      part_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      supplier_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      is_primary: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'SPartSuppliers',
      tableName: 's_part_suppliers',
      underscored: true,
      timestamps: true,
      // Tidak paranoid — hapus langsung saja, data junction tidak perlu soft delete
    }
  );

  return SPartSuppliers;
};