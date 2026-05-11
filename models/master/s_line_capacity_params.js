import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SLineCapacityParam extends Model {
    static associate(models) {
      SLineCapacityParam.belongsTo(models.SLines, {
        foreignKey: 'line_id',
        as: 'line',
      });
    }
  }

  SLineCapacityParam.init(
    {
      line_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      default_working_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 22,
      },

      default_shifts_per_day: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },

      default_working_hours_per_shift: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 7,
      },

      default_efficiency_factor: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0.85,
      },

      default_overtime_hours: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },

      default_manpower: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
      },

      default_max_takt_time: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60,
      },
    },
    {
      sequelize,
      modelName: 'SLineCapacityParam',
      tableName: 's_line_capacity_params',
      underscored: true,
      timestamps: true,
    }
  );

  return SLineCapacityParam;
};