import { Model, DataTypes } from 'sequelize'

export default (sequelize) => {
  class TProductionMaterialReplacement extends Model {
    static associate(models) {
      TProductionMaterialReplacement.belongsTo(
        models.TProductionMaterialResult,
        {
          foreignKey: 'production_result_id',
          as: 'production_result'
        }
      )

      TProductionMaterialReplacement.belongsTo(
        models.TProductionMaterialResultNgDetail,
        {
          foreignKey: 'ng_detail_id',
          as: 'ng_detail'
        }
      ) 

      TProductionMaterialReplacement.belongsTo(
        models.SStations,
        {
          foreignKey: 'station_id',
          as: 'station'
        }
      )

      TProductionMaterialReplacement.belongsTo(
        models.SParts,
        {
          foreignKey: 'material_part_id',
          as: 'material_part'
        }
      )

      TProductionMaterialReplacement.belongsTo(
        models.TPartLabels,
        {
          foreignKey: 'source_label_id',
          as: 'source_label'
        }
      )

      TProductionMaterialReplacement.belongsTo(
        models.TWorkOrderStoringItemLabel,
        {
          foreignKey: 'source_wo_item_label_id',
          as: 'source_wo_item_label'
        }
      )
    }
  }

  TProductionMaterialReplacement.init(
    {
      production_result_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      ng_detail_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      station_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      material_part_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      qty_replacement: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      replacement_reason: {
        type: DataTypes.TEXT,
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

      source_wo_item_label_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'TProductionMaterialReplacement',
      tableName: 't_production_material_replacement',
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at'
    }
  )

  return TProductionMaterialReplacement
}