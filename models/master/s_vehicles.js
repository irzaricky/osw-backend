import { Model } from 'sequelize';

export default (sequelize, DataTypes) => {
  class SVehicles extends Model {
    static associate(models) {
      SVehicles.belongsTo(models.RefVehicleType, { foreignKey: 'vehicle_type_id', as: 'vehicle_type' });
    }
  }
  
  SVehicles.init({
    vehicle_code: DataTypes.STRING,
    plate_number: DataTypes.STRING,
    vehicle_type_id: DataTypes.INTEGER,
    load_capacity: DataTypes.INTEGER,
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'SVehicles',
    tableName: 's_vehicles',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });
  
  return SVehicles;
};