import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TWorkOrderStoring extends Model {
    static associate(models) {
      TWorkOrderStoring.belongsTo(models.RefWorkOrderStoringStatus, {
        foreignKey: 'wo_status_id',
        as: 'status'
      });

      TWorkOrderStoring.belongsTo(models.RefWorkOrderStoringType, {
        foreignKey: 'wo_type_id',
        as: 'type'
      });

      TWorkOrderStoring.belongsTo(models.SUsers, {
        foreignKey: 'created_by',
        as: 'user'
      });

      TWorkOrderStoring.belongsTo(models.SMaterialDeliveryOrder, {
        foreignKey: 'ref_doc_id',
        as: 'ref_doc'
      });

      TWorkOrderStoring.belongsTo(models.SWarehouseAreas, {
        foreignKey: 'warehouse_area_id',
        as: 'area'
      });

      TWorkOrderStoring.belongsTo(models.SWorkOrder, {
        foreignKey: 'production_wo_id',
        as: 'production_wo'
      });

      TWorkOrderStoring.belongsTo(models.SStations, {
        foreignKey: 'station_id',
        as: 'station'
      });

      TWorkOrderStoring.hasMany(models.TWorkOrderStoringItem, {
        foreignKey: 'wo_id',
        as: 'items'
      });
    }
  }

  TWorkOrderStoring.init({
    wo_number: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true
    },
    wo_category: {
      type: DataTypes.ENUM('Placement', 'Take Out'),
      allowNull: false
    },
    ref_doc_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ref_doc_number: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    ref_doc_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    wo_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    wo_description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    wo_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    warehouse_area_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    wo_status_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'TWorkOrderStoring',
    tableName: 't_work_order_storing',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TWorkOrderStoring;
};