import { Model, DataTypes } from "sequelize";

export default (sequelize) => {
  class SPartRoutingDetailMaterials extends Model {
    static associate(models) {
      SPartRoutingDetailMaterials.belongsTo(models.SPartRoutingDetails, {
        foreignKey: 'routing_detail_id',
        as: 'routing_detail'
      });

      SPartRoutingDetailMaterials.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part'
      });
    }
  }

  SPartRoutingDetailMaterials.init({
    routing_detail_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'SPartRoutingDetailMaterials',
    tableName: 's_part_routing_detail_materials',
    underscored: true,
    timestamps: true
  });

  return SPartRoutingDetailMaterials;
}