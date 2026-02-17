import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SVehicles extends Model {
    static associate(models) {
      SVehicles.belongsTo(models.RefVehicleType, { foreignKey: 'vehicle_type_id', as: 'vehicle_type' });
    }
  }

  SVehicles.init({
    vehicle_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    plate_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    vehicle_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
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
