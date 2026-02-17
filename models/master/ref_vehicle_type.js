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
      allowNull: false,
      unique: true
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
    timestamps: true
  });

  return RefVehicleType;
};
