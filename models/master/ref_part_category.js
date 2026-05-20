import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefPartCategory extends Model {
    static associate(models) {
      // RefPartCategory.hasMany(models.SParts, {
      //   foreignKey: 'part_category_id',
      //   as: 'parts',
      // });
    }
  }

  RefPartCategory.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'RefPartCategory',
      tableName: 'ref_part_categories',
      underscored: true,
      paranoid: true,
      timestamps: true,
    }
  );

  return RefPartCategory;
};