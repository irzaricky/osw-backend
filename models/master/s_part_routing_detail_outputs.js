import { Model, DataTypes } from "sequelize";

export default (sequelize) => {
  class SPartRoutingDetailOutputs extends Model {
    static associate(models) {
      SPartRoutingDetailOutputs.belongsTo(models.SPartRoutingDetails, {
        foreignKey: 'routing_detail_id',
        as: 'routing_detail'
      });

      SPartRoutingDetailOutputs.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part'
      });
    }
  }

  SPartRoutingDetailOutputs.init({
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
    modelName: 'SPartRoutingDetailOutputs',
    tableName: 's_part_routing_detail_outputs',
    underscored: true,
    timestamps: true
  });

  return SPartRoutingDetailOutputs;
}