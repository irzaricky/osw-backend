import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SSkill extends Model {
    static associate(models) {
      SSkill.belongsToMany(models.SEmployeeGroupMember, {
        through: models.SEmployeeSkill,
        foreignKey: 'skill_id',
        otherKey: 'member_id',
        as: 'members',
      });
    }
  }

  SSkill.init(
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
      modelName: 'SSkill',
      tableName: 's_skills',
      underscored: true,
      timestamps: true,
    }
  );

  return SSkill;
};