import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class RefBomDocumentStatus extends Model {
    static associate(models) {
      RefBomDocumentStatus.hasMany(models.SBoms, {
        foreignKey: 'doc_status_id',
        as: 'boms',
      });
    }
  }

  RefBomDocumentStatus.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: 'RefBomDocumentStatus',
      tableName: 'ref_bom_document_statuses',
      underscored: true,
      paranoid: true,
      timestamps: true,
    }
  );

  return RefBomDocumentStatus;
};