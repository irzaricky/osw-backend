import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SCustomers extends Model {
    static associate(models) {
      SCustomers.hasMany(models.SSalesForecasts, { foreignKey: 'customer_id', as: 'forecasts' });
    }
  }

  SCustomers.init({
    customer_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SCustomers',
    tableName: 's_customers',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SCustomers;
};
