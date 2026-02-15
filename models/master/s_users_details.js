import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SUserDetail extends Model {
    static associate(models) {
      SUserDetail.belongsTo(models.SUsers, { foreignKey: 'user_id', as: 'user' });
      SUserDetail.belongsTo(models.SFactories, { foreignKey: 'factory_id', as: 'factory' });
      SUserDetail.belongsTo(models.SLines, { foreignKey: 'line_id', as: 'line' });
    }
  }

  SUserDetail.init({
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
    },
    employee_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    full_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    phone_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    factory_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SUserDetail',
    tableName: 's_users_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SUserDetail;
};
