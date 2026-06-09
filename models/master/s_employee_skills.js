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

      SEmployeeSkill.belongsTo(models.SEmployee, {
        foreignKey: 'employee_id',
        as: 'employee',
      });
    }
  }

  SEmployeeSkill.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 's_employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
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