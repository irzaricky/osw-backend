import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SEmployeePosition extends Model {
    static associate(models) {
      SEmployeePosition.hasMany(models.SEmployeeGroupMember, {
        foreignKey: 'position_id',
        as: 'members',
      });
    }
  }

  SEmployeePosition.init(
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      description: {
        type: DataTypes.TEXT,
      },
    },
    {
      sequelize,
      modelName: 'SEmployeePosition',
      tableName: 's_employee_positions',
      underscored: true,
      timestamps: true,
    }
  );

  return SEmployeePosition;
};