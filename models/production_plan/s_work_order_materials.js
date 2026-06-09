import { Model, DataTypes } from "sequelize";

export default (sequelize) => {
  class SWorkOrderMaterial extends Model {
    static associate(models) {
      SWorkOrderMaterial.belongsTo(models.SWorkOrder, { foreignKey: 'wo_id', as: 'work_order' });
      SWorkOrderMaterial.belongsTo(models.SParts, { foreignKey: 'material_part_id', as: 'material_part' });
    }
  }

  SWorkOrderMaterial.init({
    wo_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 's_work_orders', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    },
    material_part_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 's_parts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    },
    planned_quantity: {
      type: DataTypes.DECIMAL(14, 4),
      allowNull: false,
      defaultValue: 0.0000
    },
    actual_quantity: {
      type: DataTypes.DECIMAL(14, 4),
      allowNull: true,
      defaultValue: 0.0000
    },
    uom: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SWorkOrderMaterial',
    tableName: 's_work_order_materials',
    underscored: true,
    timestamps: true,
    paranoid: true
  });

  return SWorkOrderMaterial;
}