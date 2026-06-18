import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SPartRoutingDetails extends Model {
    static associate(models) {
      SPartRoutingDetails.belongsTo(models.SPartRoutings, {
        foreignKey: 'routing_id',
        as: 'routing'
      });

      SPartRoutingDetails.belongsTo(models.SStations, {
        foreignKey: 'station_id',
        as: 'station'
      });

      SPartRoutingDetails.belongsTo(models.SJobs, {
        foreignKey: 'job_id',
        as: 'job'
      });
    }
  }

  SPartRoutingDetails.init({
    routing_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    station_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    job_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    standard_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    setup_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    queue_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    move_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    manpower_required: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
  }, {
    sequelize,
    modelName: 'SPartRoutingDetails',
    tableName: 's_part_routing_details',
    underscored: true,
    timestamps: true
  });

  return SPartRoutingDetails;
};