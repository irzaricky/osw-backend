import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefPartTypes extends Model {
    static associate(models) {
      // define association here
    }
  }

  RefPartTypes.init({
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'RefPartTypes',
    tableName: 'ref_part_types',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefPartTypes;
};
