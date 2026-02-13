import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefStationTypes extends Model {
    static associate(models) {
      RefStationTypes.hasMany(models.SStations, { foreignKey: 'station_type_id' });
    }
  }

  RefStationTypes.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'RefStationTypes',
    tableName: 'ref_station_types',
    underscored: true,
    timestamps: true
  });

  return RefStationTypes;
};
