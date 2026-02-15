import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SDefects extends Model {
    static associate(models) {
      SDefects.belongsTo(models.RefDefectCategories, { foreignKey: 'defect_category_id', as: 'category' });
    }
  }

  SDefects.init({
    defect_category_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'SDefects',
    tableName: 's_defects',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SDefects;
};
