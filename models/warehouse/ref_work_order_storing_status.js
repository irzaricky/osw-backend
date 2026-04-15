import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefWorkOrderStoringStatus extends Model {
    static associate(models) {
      RefWorkOrderStoringStatus.hasMany(models.TWorkOrderStoring, {
        foreignKey: 'wo_status_id',
        as: 'work_orders'
      });
    }
  }

  RefWorkOrderStoringStatus.init({
    name: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'RefWorkOrderStoringStatus',
    tableName: 'ref_work_order_storing_status',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefWorkOrderStoringStatus;
};