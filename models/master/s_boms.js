import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SBoms extends Model {
    static associate(models) {
      // A BOM belongs to a Part (which covers both Products and Sub-assemblies)
      SBoms.belongsTo(models.SParts, { foreignKey: 'parent_part_id', as: 'parent_part' });
      
      // A BOM has many details (components)
      SBoms.hasMany(models.SBomDetails, { foreignKey: 'bom_id', as: 'details' });
    }
  }

  SBoms.init({
    bom_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    description: DataTypes.STRING,
    parent_part_id: DataTypes.INTEGER,
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    status_approval: DataTypes.STRING,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'SBoms',
    tableName: 's_boms',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return SBoms;
};
