import { Model, DataTypes } from 'sequelize'

export default (sequelize) => {
  class TProductionMaterialResult extends Model {
    static associate(models) {
      TProductionMaterialResult.belongsTo(models.SWorkOrder, {
        foreignKey: 'production_wo_id',
        as: 'production_wo'
      })

      TProductionMaterialResult.belongsTo(models.SShifts, {
        foreignKey: 'shift_id',
        as: 'shift'
      })

      TProductionMaterialResult.belongsTo(models.SStations, {
        foreignKey: 'station_id',
        as: 'station'
      })

      TProductionMaterialResult.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'product_part'
      })

      TProductionMaterialResult.belongsTo(models.SParts, {
        foreignKey: 'material_part_id',
        as: 'material_part'
      })

      TProductionMaterialResult.hasMany(models.TProductionMaterialResultNgDetail, {
        foreignKey: 'production_result_id',
        as: 'ng_details'
      })

      TProductionMaterialResult.hasMany(models.TProductionMaterialReplacement, {
        foreignKey: 'production_result_id',
        as: 'replacements'
      })

      TProductionMaterialResult.hasMany(models.TProductionMaterialScrap, {
        foreignKey: 'production_result_id',
        as: 'scraps'
      })
    }
  }

  TProductionMaterialResult.init(
    {
      production_wo_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      production_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },

      shift_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      station_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      part_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      material_part_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      planning_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      actual_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      total_ok: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      total_ng: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      remarks: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'TProductionMaterialResult',
      tableName: 't_production_material_result',
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at'
    }
  )

  return TProductionMaterialResult
}