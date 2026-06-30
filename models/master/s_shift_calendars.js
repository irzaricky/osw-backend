import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SShiftCalendars extends Model {
    static associate(models) {
      SShiftCalendars.belongsTo(models.SLines, { foreignKey: 'line_id', as: 'line' });
      SShiftCalendars.belongsTo(models.SShifts, { foreignKey: 'shift_id', as: 'shift' });
      SShiftCalendars.belongsTo(models.RefTypeCalendars, { foreignKey: 'ref_type_calendar_id', as: 'type_calendar' });
    }
  }

  SShiftCalendars.init({
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    shift_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    ref_type_calendar_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    date_event: {
      type: DataTypes.STRING,
      allowNull: false
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'SShiftCalendars',
    tableName: 's_shift_calendars',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SShiftCalendars;
};
