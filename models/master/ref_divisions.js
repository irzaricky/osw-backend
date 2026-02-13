import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefDivisions extends Model {
    static associate(models) {
      RefDivisions.hasMany(models.SRoles, { foreignKey: 'division_id' });
    }
  }

  RefDivisions.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'RefDivisions',
    tableName: 'ref_divisions',
    underscored: true,
    timestamps: true
  });

  return RefDivisions;
};