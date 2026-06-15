import { Model, DataTypes } from 'sequelize'

export default (sequelize) => {
  class TProductionMaterialResult extends Model {
    static associate(models) {
      // station
      TProductionMaterialResult.belongsTo(models.SStations, {
        foreignKey: 'station_id',
        as: 'station'
      })

      // product
      TProductionMaterialResult.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'product_part'
      })

      // material (optional direct)
      TProductionMaterialResult.belongsTo(models.SParts, {
        foreignKey: 'material_part_id',
        as: 'material_part'
      })

     
      TProductionMaterialResult.hasMany(
        models.TProductionMaterialReplacement,
        {
          foreignKey: 'production_result_id',
          as: 'replacements'
        }
      )

    
      TProductionMaterialResult.hasMany(
        models.TProductionMaterialScrap,
        {
          foreignKey: 'production_result_id',
          as: 'scraps'
        }
      )
    }
  }

  TProductionMaterialResult.init(
    {
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
        defaultValue: 0
      },

      actual_qty: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },

      total_ok: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },

      total_ng: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },

      remarks: {
        type: DataTypes.TEXT
      },

      // batch_number: {
      //   type: DataTypes.STRING,
      //   allowNull: true
      // },

      created_by: {
        type: DataTypes.INTEGER
      }
    },
    {
      sequelize,
      modelName: 'TProductionMaterialResult',
      tableName: 't_production_material_result',
      underscored: true,
      paranoid: true,
      deletedAt: 'deleted_at'
    }
  )

  return TProductionMaterialResult
}