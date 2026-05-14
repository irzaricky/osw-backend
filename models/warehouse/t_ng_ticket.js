import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TNgTicket extends Model {
    static associate(models) {
      TNgTicket.belongsTo(models.TMaterialReceivingItemLabel, {
        foreignKey: 'mr_item_label_id',
        as: 'mr_item_label'
      });

      TNgTicket.belongsTo(models.SUsers, {
        foreignKey: 'created_by',
        as: 'user'
      });

      TNgTicket.hasOne(models.TNgTicketQuantity, {
        foreignKey: 'ng_ticket_id',
        as: 'quantity'
      });

      TNgTicket.hasMany(models.TNgTicketQuality, {
        foreignKey: 'ng_ticket_id',
        as: 'qualities'
      });
    }
  }

  TNgTicket.init({
    mr_item_label_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
    },
    ng_ticket_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'TNgTicket',
    tableName: 't_ng_ticket',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TNgTicket;
};