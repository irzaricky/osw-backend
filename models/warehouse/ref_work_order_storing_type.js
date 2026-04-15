import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefWorkOrderStoringType extends Model {
    static associate(models) {
      RefWorkOrderStoringType.hasMany(models.TWorkOrderStoring, {
        foreignKey: 'wo_type_id',
        as: 'work_orders'
      });
    }
  }

  RefWorkOrderStoringType.init({
    name: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'RefWorkOrderStoringType',
    tableName: 'ref_work_order_storing_type',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefWorkOrderStoringType;
};