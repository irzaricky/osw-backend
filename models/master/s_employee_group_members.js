import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SEmployeeGroupMember extends Model {
    static associate(models) {
      SEmployeeGroupMember.belongsTo(models.SEmployeeGroup, {
        foreignKey: 'group_id',
        as: 'group',
      });
      SEmployeeGroupMember.belongsTo(models.SEmployee, {
        foreignKey: 'employee_id',
        as: 'employee',
      });
    }
  }

  SEmployeeGroupMember.init(
    {
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 's_employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
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