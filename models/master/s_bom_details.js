import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SBomDetails extends Model {
    static associate(models) {
      // BOM induk
      SBomDetails.belongsTo(models.SBoms, {
        foreignKey: 'bom_id',
        as: 'bom',
      });

      // Part yang digunakan sebagai komponen
      SBomDetails.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part',
      });

      // UOM komponen (bisa berbeda dengan UOM header BOM)
      SBomDetails.belongsTo(models.SUom, {
        foreignKey: 'uom_id',
        as: 'uom',
      });

      // Child BOM — jika komponen ini adalah sub-assembly yang punya BOM sendiri
      SBomDetails.belongsTo(models.SBoms, {
        foreignKey: 'child_bom_id',
        as: 'child_bom',
      });
    }
  }

  SBomDetails.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      bom_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      part_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      uom_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      qty_required: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 1,
        validate: {
          min: { args: [0.0001], msg: 'qty_required harus lebih dari 0' },
        },
      },
      scrap_percentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: { args: [0], msg: 'scrap_percentage tidak boleh negatif' },
        },
      },
      sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      level: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: { args: [0], msg: 'level minimal 0' },
          max: { args: [5], msg: 'level maksimal 5' },
        },
      },
      child_bom_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SBomDetails',
      tableName: 's_bom_details',
      underscored: true,
      paranoid: true,
      timestamps: true,
      deletedAt: 'deleted_at',
    }
  );

  return SBomDetails;
};