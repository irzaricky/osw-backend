import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SEmployeeGroupMember extends Model {
    static associate(models) {
      SEmployeeGroupMember.belongsTo(models.SEmployeeGroup, {
        foreignKey: 'group_id',
        as: 'group',
      });

      SEmployeeGroupMember.belongsTo(models.SEmployeePosition, {
        foreignKey: 'position_id',
        as: 'position',
      });

      SEmployeeGroupMember.belongsToMany(models.SSkill, {
        through: models.SEmployeeSkill,
        foreignKey: 'member_id',
        otherKey: 'skill_id',
        as: 'skills',
      });
    }
  }

  SEmployeeGroupMember.init(
    {
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      employee_code: {
        type: DataTypes.STRING,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      position_id: {
        type: DataTypes.INTEGER,
      },

      skill_level: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },

      active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'SEmployeeGroupMember',
      tableName: 's_employee_group_members',
      underscored: true,
      timestamps: true,
    }
  );

  return SEmployeeGroupMember;
};