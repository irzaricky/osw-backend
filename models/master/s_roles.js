import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SRoles extends Model {
    static associate(models) {
      SRoles.belongsTo(models.RefDivisions, { foreignKey: 'division_id', as: 'division' });
    }
  }

  SRoles.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    division_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'SRoles',
    tableName: 's_roles',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SRoles;
};