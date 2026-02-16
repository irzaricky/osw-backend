import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SUsers extends Model {
    static associate(models) {
      SUsers.belongsTo(models.SRoles, { foreignKey: 'role_id', as: 'role' });
      SUsers.hasOne(models.SUserDetail, { foreignKey: 'user_id', as: 'user_detail' });
    }
  }

  SUsers.init({

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'SUsers',
    tableName: 's_users',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SUsers;
};
