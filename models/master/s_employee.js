import { Model, DataTypes } from "sequelize";

export default (sequelize) => {
  class SEmployee extends Model {
    static associate(models) {
    }
  }

  SEmployee.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    employee_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    position_name: {
      type: DataTypes.STRING(255),
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    qr_token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'SEmployee',
    tableName: 's_employees',
    underscored: true,
    timestamps: true,
    paranoid: true
  });

  return SEmployee;
}