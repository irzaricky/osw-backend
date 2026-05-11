import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SEmployeeSkill extends Model {
    static associate(models) {
      SEmployeeSkill.belongsTo(models.SEmployeeGroupMember, {
        foreignKey: 'member_id',
        as: 'member',
      });

      SEmployeeSkill.belongsTo(models.SSkill, {
        foreignKey: 'skill_id',
        as: 'skill',
      });
    }
  }

  SEmployeeSkill.init(
    {
      member_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      skill_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      level: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },
    },
    {
      sequelize,
      modelName: 'SEmployeeSkill',
      tableName: 's_employee_skills',
      underscored: true,
      timestamps: true,
    }
  );

  return SEmployeeSkill;
};