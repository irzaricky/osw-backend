'use strict';
import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SMrp extends Model {
    static associate(models) {
      // Sales Purchase Request sumber MRP (dari modul Sales)
      SMrp.belongsTo(models.SSalesPurchaseRequests, {
        foreignKey: 'spr_id',
        as: 'sales_plan',
      });

      // Production Plan (dari modul PPIC) — opsional, jika generate dari PP
      SMrp.belongsTo(models.SProductionPlan, {
        foreignKey: 'production_plan_id',
        as: 'production_plan',
      });

      // Detail items material
      SMrp.hasMany(models.SMrpDetail, {
        foreignKey: 'mrp_id',
        as: 'details',
      });

      // Staff Material yang membuat
      SMrp.belongsTo(models.SUsers, {
        foreignKey: 'created_by',
        as: 'creator',
      });

      // Supervisor Material yang approve/reject
      SMrp.belongsTo(models.SUsers, {
        foreignKey: 'approved_by',
        as: 'approver',
      });

      // History / audit trail perubahan status MRP
      SMrp.hasMany(models.SMrpLog, {
        foreignKey: 'mrp_id',
        as: 'logs',
      });
    }
  }

  SMrp.init(
    {
      // Relasi ke Sales Purchase Request (Sales Plan)
      spr_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Relasi ke Production Plan (opsional, jika generate dari PP)
      production_plan_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Nomor MRP: MRP-YYYYMMDD-XXXX
      number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // Prioritas: High, Medium, Low
      priority: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      // Catatan dari Staff Material
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Status: Draft → Submitted → Approved / Rejected
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Draft',
      },
      // Staff Material pembuat
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Supervisor Material yang melakukan review
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Alasan penolakan (wajib diisi saat Reject)
      rejected_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SMrp',
      tableName: 's_mrps',
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at',
    }
  );

  return SMrp;
};