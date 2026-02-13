import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefDefects extends Model {
    static associate(models) {
      // No external formatted category association needed as it's now a string field
    }
  }

  RefDefects.init({
    category: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'RefDefects',
    tableName: 'ref_defects',
    underscored: true,
    timestamps: true
  });

  return RefDefects;
};
