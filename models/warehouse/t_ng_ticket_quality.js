import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class TNgTicketQuality extends Model {
    static associate(models) {
      TNgTicketQuality.belongsTo(models.TNgTicket, {
        foreignKey: 'ng_ticket_id',
        as: 'ng_ticket'
      });

      TNgTicketQuality.belongsTo(models.SDefects, {
        foreignKey: 'defect_id',
        as: 'defect'
      });
    }
  }

  TNgTicketQuality.init({
    ng_ticket_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    defect_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    image: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'TNgTicketQuality',
    tableName: 't_ng_ticket_quality',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return TNgTicketQuality;
};