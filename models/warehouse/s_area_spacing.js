import { Model } from 'sequelize';

export default (sequelize, DataTypes) => {
  class SAreaSpacing extends Model {
    static associate(models) {
      SAreaSpacing.belongsTo(models.SWarehouseAreas, {
        foreignKey: 'area_id',
        as: 'area'
      });
    }
  }

  SAreaSpacing.init({
    area_id: {
      allowNull: false,
      type: DataTypes.INTEGER
    },
    col_index: {
      allowNull: false,
      type: DataTypes.INTEGER
    },
    col_spacing: {
      allowNull: false,
      type: DataTypes.INTEGER
    }
  }, {
    sequelize,
    modelName: 'SAreaSpacing',
    tableName: 's_area_spacing',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SAreaSpacing;
};