import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SDocks extends Model {
    static associate(models) {
      SDocks.belongsTo(models.SWarehouseAreas, { foreignKey: 'area_id', as: 'area' });
    }
  }

  SDocks.init({
    dock_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    area_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'SDocks',
    tableName: 's_docks',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SDocks;
};
