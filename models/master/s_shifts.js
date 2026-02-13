import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SShifts extends Model {
    static associate(models) {
      // Define associations here if needed
    }
  }

  SShifts.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    shift_number: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('REGULAR', 'NON REGULAR'),
      allowNull: false
    },
    start_time: {
      type: DataTypes.TIME,
      allowNull: false
    },
    end_time: {
      type: DataTypes.TIME,
      allowNull: false
    },
    category: {
      type: DataTypes.ENUM('PRODUCTIVE', 'BREAK'),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'SShifts',
    tableName: 's_shifts',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SShifts;
};
