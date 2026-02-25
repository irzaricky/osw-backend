import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefMasterCalendars extends Model {
    static associate(models) {
      RefMasterCalendars.belongsTo(models.RefTypeCalendars, {
        foreignKey: 'ref_type_calendar_id',
        as: 'type_calendar'
      });
    }
  }

  RefMasterCalendars.init({
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      unique: true
    },
    ref_type_calendar_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'RefMasterCalendars',
    tableName: 'ref_master_calendars',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefMasterCalendars;
};
