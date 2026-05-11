import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SEmployeeGroup extends Model {
    static associate(models) {
      SEmployeeGroup.belongsTo(models.SLines, {
        foreignKey: 'line_id',
        as: 'line',
      });

      SEmployeeGroup.belongsTo(models.SUsers, {
        foreignKey: 'leader_id',
        as: 'leader',
      });

      SEmployeeGroup.hasMany(models.SEmployeeGroupMember, {
        foreignKey: 'group_id',
        as: 'members',
      });
    }
  }

  SEmployeeGroup.init(
    {
      line_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      leader_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      description: {
        type: DataTypes.TEXT,
      },

      active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'SEmployeeGroup',
      tableName: 's_employee_groups',
      underscored: true,
      timestamps: true,
    }
  );

  return SEmployeeGroup;
};