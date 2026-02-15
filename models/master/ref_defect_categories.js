import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefDefectCategories extends Model {
    static associate(models) {
      RefDefectCategories.hasMany(models.SDefects, { foreignKey: 'defect_category_id', as: 'defects' });
    }
  }

  RefDefectCategories.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'RefDefectCategories',
    tableName: 'ref_defect_categories',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefDefectCategories;
};
