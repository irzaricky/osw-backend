import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SFactories extends Model {
    static associate(models) {
      SFactories.hasMany(models.SLines, { foreignKey: 'factory_id' });
    }
  }

  SFactories.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    maps_url: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SFactories',
    tableName: 's_factories',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SFactories;
};
