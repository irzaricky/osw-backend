import { Model } from 'sequelize';

export default (sequelize, DataTypes) => {
  class RefVehicleType extends Model {
    static associate(models) {
      RefVehicleType.hasMany(models.SVehicles, { foreignKey: 'vehicle_type_id' });
    }
  }
  RefVehicleType.init({
    name: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'RefVehicleType',
    tableName: 'ref_vehicle_types',
    underscored: true,
    timestamps: true
  });
  return RefVehicleType;
};