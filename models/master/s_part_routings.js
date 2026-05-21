import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SPartRoutings extends Model {
    static associate(models) {
      SPartRoutings.belongsTo(models.SParts, {
        foreignKey: 'part_id',
        as: 'part'
      });

      SPartRoutings.belongsTo(models.SLines, {
        foreignKey: 'line_id',
        as: 'line'
      });

      SPartRoutings.hasMany(models.SPartRoutingDetails, {
        foreignKey: 'routing_id',
        as: 'routing_details'
      });
    }
  }

  SPartRoutings.init({
    routing_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },

    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    line_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },

    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },

    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SPartRoutings',
    tableName: 's_part_routings',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SPartRoutings;
};