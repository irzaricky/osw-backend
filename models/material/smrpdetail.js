'use strict';
import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SMrpDetail extends Model {
    static associate(models) {
      SMrpDetail.belongsTo(models.SMrp, {
        foreignKey: 'mrp_id',
        as: 'mrp',
      });

      // Part/komponen material yang dibutuhkan
      SMrpDetail.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part',
      });

      // BOM asal kalkulasi (untuk traceability)
      SMrpDetail.belongsTo(models.SBoms, {
        foreignKey: 'bom_id',
        as: 'bom',
      });
    }
  }

  SMrpDetail.init(
    {
      mrp_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      part_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      bom_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Qty kebutuhan material (hasil kalkulasi BOM atau input manual)
      qty: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
      },
      // Catatan per item (misal: "Auto-generated from BOM-001")
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SMrpDetail',
      tableName: 's_mrp_details',
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at',
    }
  );

  return SMrpDetail;
};