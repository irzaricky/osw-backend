import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefVehicleType extends Model {
    static associate(models) {
      RefVehicleType.hasMany(models.SVehicles, { foreignKey: 'vehicle_type_id' });
    }
  }

  RefVehicleType.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    load_capacity: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'RefVehicleType',
    tableName: 'ref_vehicle_types',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefVehicleType;
};
