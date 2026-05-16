import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TNgTicketQuantity extends Model {
    static associate(models) {
      TNgTicketQuantity.belongsTo(models.TNgTicket, {
        foreignKey: 'ng_ticket_id',
        as: 'ng_ticket'
      });
    }
  }

  TNgTicketQuantity.init({
    ng_ticket_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
    },
    expected_qty: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    actual_qty: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'TNgTicketQuantity',
    tableName: 't_ng_ticket_quantity',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TNgTicketQuantity;
};