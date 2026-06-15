import { Model, DataTypes } from 'sequelize'

export default (sequelize) => {
  class TProductionMaterialScrap extends Model {
    static associate(models) {
      
      TProductionMaterialScrap.belongsTo(
        models.TProductionMaterialResult,
        {
          foreignKey: 'production_result_id',
          as: 'production_result'
        }
      )

     
      TProductionMaterialScrap.belongsTo(
        models.SParts,
        {
          foreignKey: 'part_id',
          as: 'product_part'
        }
      )

   
      TProductionMaterialScrap.belongsTo(
        models.SParts,
        {
          foreignKey: 'material_part_id',
          as: 'material_part'
        }
      )

      
      TProductionMaterialScrap.belongsTo(
        models.SStations,
        {
          foreignKey: 'station_id',
          as: 'station'
        }
      )
    }
  }

  TProductionMaterialScrap.init(
    {
      
      production_result_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      scrap_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },

      station_id: {
        type: DataTypes.INTEGER,
        allowNull: true
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
      paranoid: true,
      deletedAt: 'deleted_at'
    }
  )

  return TProductionMaterialScrap
}