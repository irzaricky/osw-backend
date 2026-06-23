import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SBoms extends Model {
    static associate(models) {
      // Parent part (produk yang dibentuk oleh BOM ini)
      SBoms.belongsTo(models.SParts, {
        foreignKey: 'parent_part_id',
        as: 'parent_part',
      });

      // UOM header BOM
      SBoms.belongsTo(models.SUom, {
        foreignKey: 'uom_id',
        as: 'uom',
      });

      // User yang membuat
      SBoms.belongsTo(models.SUsers, {
        foreignKey: 'created_by',
        as: 'creator',
      });

      // User yang approve
      SBoms.belongsTo(models.SUsers, {
        foreignKey: 'approved_by',
        as: 'approver',
      });

      // Komponen BOM
      SBoms.hasMany(models.SBomDetails, {
        foreignKey: 'bom_id',
        as: 'details',
      });

      // BOM ini bisa menjadi child_bom dari BOM detail lain (sub-assembly)
      SBoms.hasMany(models.SBomDetails, {
        foreignKey: 'child_bom_id',
        as: 'parent_bom_details',
      });
    }
  }

  SBoms.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      bom_number: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      bom_version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      parent_part_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      uom_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      doc_status: {
        type: DataTypes.ENUM('Draft', 'Pending_Approval', 'Approved', 'Rejected'),
        allowNull: true,
      },
      activation_status: {
        type: DataTypes.ENUM('Inactive', 'Active'),
        allowNull: true,
      },
      reject_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      activated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SBoms',
      tableName: 's_boms',
      underscored: true,
      paranoid: true,
      timestamps: true,
      deletedAt: 'deleted_at',
    }
  );

  return SBoms;
};