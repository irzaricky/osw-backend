import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefTypeCalendars extends Model {
    static associate(models) {
      RefTypeCalendars.hasMany(models.RefMasterCalendars, {
        foreignKey: 'ref_type_calendar_id',
        as: 'master_calendars'
      });
      RefTypeCalendars.hasMany(models.SShiftCalendars, {
        foreignKey: 'ref_type_calendar_id',
        as: 'shift_calendars'
      });
    }
  }

  RefTypeCalendars.init({
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    is_holiday: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'RefTypeCalendars',
    tableName: 'ref_type_calendars',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefTypeCalendars;
};
