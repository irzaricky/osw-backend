import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SUom extends Model {
    static associate(models) {
      SUom.hasMany(models.SParts, {
        foreignKey: 'uom_id',
        as: 'parts',
      });

      SUom.hasMany(models.SBoms, {
        foreignKey: 'uom_id',
        as: 'boms',
      });

      SUom.hasMany(models.SBomDetails, {
        foreignKey: 'uom_id',
        as: 'bom_details',
      });
    }
  }

  SUom.init(
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
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'SUom',
      tableName: 's_uoms',
      underscored: true,
      paranoid: true,
      timestamps: true,
      deletedAt: 'deleted_at',
    }
  );

  return SUom;
};