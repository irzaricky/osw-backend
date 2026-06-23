import { Model, DataTypes } from "sequelize";

export default (sequelize) => {
  class SWorkOrderMaterial extends Model {
    static associate(models) {
      SWorkOrderMaterial.belongsTo(models.SWorkOrderStation, { foreignKey: 'wo_station_id', as: 'work_order_station' });
      SWorkOrderMaterial.belongsTo(models.SParts, { foreignKey: 'material_part_id', as: 'material_part' });
    }
  }

  SWorkOrderMaterial.init({
    wo_station_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    material_part_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
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