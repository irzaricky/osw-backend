import { Model, DataTypes } from 'sequelize'

export default (sequelize) => {
  class TProductionMaterialScrap extends Model {
    static associate(models) {
      TProductionMaterialScrap.belongsTo(models.TProductionMaterialResult, {
        foreignKey: 'production_result_id',
        as: 'production_result'
      })

      TProductionMaterialScrap.belongsTo(models.TProductionMaterialReplacement, {
        foreignKey: 'replacement_id',
        as: 'replacement'
      })

      TProductionMaterialScrap.belongsTo(models.SStations, {
        foreignKey: 'station_id',
        as: 'station'
      })

      TProductionMaterialScrap.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'product_part'
      })

      TProductionMaterialScrap.belongsTo(models.SParts, {
        foreignKey: 'material_part_id',
        as: 'material_part'
      })

      TProductionMaterialScrap.belongsTo(models.TPartLabels, {
        foreignKey: 'source_label_id',
        as: 'source_label'
      })
    }
  }

  TProductionMaterialScrap.init(
    {
      production_result_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      replacement_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      scrap_date: {
        type: DataTypes.DATEONLY,
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
        allowNull: false
      },

      qty_scrap: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      weight_per_pcs: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
      },

      total_weight: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
      },

      source_label_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      source_label_number: {
        type: DataTypes.STRING(120),
        allowNull: true
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
      modelName: 'TProductionMaterialScrap',
      tableName: 't_production_material_scrap',
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at'
    }
  )

  return TProductionMaterialScrap
}