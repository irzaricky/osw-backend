import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefBomActivationStatus extends Model {
    static associate(models) {
      RefBomActivationStatus.hasMany(models.SBoms, {
        foreignKey: 'activation_status_id',
        as: 'boms',
      });
    }
  }

  RefBomActivationStatus.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: 'RefBomActivationStatus',
      tableName: 'ref_bom_activation_statuses',
      underscored: true,
      paranoid: true,
      timestamps: true,
    }
  );

  return RefBomActivationStatus;
};