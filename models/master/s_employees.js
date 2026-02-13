import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SEmployees extends Model {
    static associate(models) {
      SEmployees.belongsTo(models.SUsers, { foreignKey: 'user_id', as: 'user' });
      SEmployees.belongsTo(models.SFactories, { foreignKey: 'factory_id', as: 'factory' });
      SEmployees.belongsTo(models.SLines, { foreignKey: 'line_id', as: 'line' });
    }
  }

  SEmployees.init({
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
    modelName: 'SEmployees',
    tableName: 's_employees',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SEmployees;
};
