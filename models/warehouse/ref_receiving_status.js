import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefReceivingStatus extends Model {
    static associate(models) {
      RefReceivingStatus.hasMany(models.TMaterialReceiving, {
        foreignKey: 'status_id',
        as: 'material_receivings'
      });
    }
  }

  RefReceivingStatus.init({
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'RefReceivingStatus',
    tableName: 'ref_receiving_status',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return RefReceivingStatus;
};