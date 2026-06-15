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
        models.TWarehouseStock,
        {
          foreignKey: 'warehouse_stock_id',
          as: 'warehouse_stock'
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

      station_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      material_part_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },

      
      warehouse_stock_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      label_number: {
        type: DataTypes.STRING,
        allowNull: true
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

      
      status: {
        type: DataTypes.ENUM(
          'PENDING',
          'APPROVED',
          'USED',
          'REJECTED'
        ),
        defaultValue: 'PENDING'
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
      paranoid: true,
      deletedAt: 'deleted_at',
      timestamps: true
    }
  )

  return TProductionMaterialReplacement
}