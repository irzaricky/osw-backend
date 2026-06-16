import { Model, DataTypes } from 'sequelize'

export default (sequelize) => {
  class TProductionMaterialResultNgDetail extends Model {
    static associate(models) {
      TProductionMaterialResultNgDetail.belongsTo(models.TProductionMaterialResult, {
        foreignKey: 'production_result_id',
        as: 'production_result'
      })

      TProductionMaterialResultNgDetail.belongsTo(models.SParts, {
        foreignKey: 'material_part_id',
        as: 'material_part'
      })

      TProductionMaterialResultNgDetail.belongsTo(models.TPartLabels, {
        foreignKey: 'source_label_id',
        as: 'source_label'
      })
    }
  }

  TProductionMaterialResultNgDetail.init(
    {
      production_result_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      material_part_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      source_label_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      source_label_number: {
        type: DataTypes.STRING(120),
        allowNull: true
      },

      qty_ng: {
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
      modelName: 'TProductionMaterialResultNgDetail',
      tableName: 't_production_material_result_ng_details',
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at'
    }
  )

  return TProductionMaterialResultNgDetail
}