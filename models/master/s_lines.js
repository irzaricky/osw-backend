import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SLines extends Model {
    static associate(models) {
      SLines.belongsTo(models.SFactories, { foreignKey: 'factory_id', as: 'factory' });
      SLines.hasMany(models.SStations, { foreignKey: 'line_id', as: 'stations' });
      SLines.hasOne(models.SLineCapacityParam, { foreignKey: 'line_id', as: 'capacity_param' });
      SLines.hasMany(models.SEmployeeGroup,    { foreignKey: 'line_id', as: 'employee_groups' });
    }
  }

  SLines.init({
    line_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    factory_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'SLines',
    tableName: 's_lines',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SLines;
};
