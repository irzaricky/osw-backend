import { Model, DataTypes } from "sequelize";

export default (sequelize) => {
  class SEmployee extends Model {
    static associate(models) {
      SEmployee.belongsTo(models.SEmployeePosition, { foreignKey: 'position_id', as: 'position' });
      SEmployee.hasMany(models.SEmployeeGroupMember, { foreignKey: 'employee_id', as: 'group_memberships' });
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
    position_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 's_employee_positions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
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