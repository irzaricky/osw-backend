import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefMasterCalendars extends Model {
    static associate(models) {
      // Define associations here if needed
    }
  }

  RefMasterCalendars.init({
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      primaryKey: true
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    month: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    day: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    is_holiday: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_weekend: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
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
