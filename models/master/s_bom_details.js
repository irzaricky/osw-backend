import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SBomDetails extends Model {
    static associate(models) {
      // Detail belongs to a BOM Header
      SBomDetails.belongsTo(models.SBoms, { foreignKey: 'bom_id', as: 'bom' });
      
      // Detail is a usage of a Part
      SBomDetails.belongsTo(models.SParts, { foreignKey: 'part_id', as: 'component' });
    }
  }

  SBomDetails.init({
    bom_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    qty_required: {
      type: DataTypes.DECIMAL(10, 4),
      defaultValue: 1
    },
    level: DataTypes.INTEGER,
    type: DataTypes.STRING(50),
    child_bom_number: DataTypes.STRING,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'SBomDetails',
    tableName: 's_bom_details',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SBomDetails;
};
