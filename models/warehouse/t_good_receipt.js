import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TGoodReceipt extends Model {
    static associate(models) {
      TGoodReceipt.belongsTo(models.TMaterialReceiving, {
        foreignKey: 'mr_id',
        as: 'material_receiving'
      });

      TGoodReceipt.belongsTo(models.SUsers, {
        foreignKey: 'approved_by',
        as: 'approver'
      });
    }
  }

  TGoodReceipt.init({
    mr_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
    },
    approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'TGoodReceipt',
    tableName: 't_good_receipt',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TGoodReceipt;
};