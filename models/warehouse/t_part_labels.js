import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TPartLabels extends Model {
    static associate(models) {
      TPartLabels.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part'
      });

      TPartLabels.hasOne(models.TWorkOrderStoringItemLabel, {
        foreignKey: 'label_id',
        as: 'work_order_item_label'
      });

      TPartLabels.hasOne(models.TMaterialReceivingItemLabel, {
        foreignKey: 'label_id',
        as: 'material_receiving_item_label'
      });
    }
  }

  TPartLabels.init({
    label_number: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'TPartLabels',
    tableName: 't_part_labels',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TPartLabels;
};