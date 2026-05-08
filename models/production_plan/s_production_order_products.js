import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class SProductionOrderProduct extends Model {
    static associate(models) {
      SProductionOrderProduct.belongsTo(models.SProductionOrder, { foreignKey: 'po_id', as: 'production_order' });
      SProductionOrderProduct.belongsTo(models.SProductionPlanDetail, { foreignKey: 'plan_detail_id', as: 'plan_detail' });
      SProductionOrderProduct.belongsTo(models.SCustomers, { foreignKey: 'customer_id', as: 'customer' });
      SProductionOrderProduct.belongsTo(models.SParts, { foreignKey: 'part_id', as: 'part' });
      SProductionOrderProduct.belongsTo(models.SLines, { foreignKey: 'line_id', as: 'line' });
      SProductionOrderProduct.hasMany(models.SProductionOrderSchedule, { foreignKey: 'po_product_id', as: 'schedules' });
    }
  }

  SProductionOrderProduct.init({
    po_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    plan_detail_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    line_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    delivery_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    planned_qty: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    scheduled_qty: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    actual_qty: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    notes: {
      type: DataTypes.TEXT
    }
  }, {
    sequelize,
    modelName: 'SProductionOrderProduct',
    tableName: 's_production_order_products',
    underscored: true,
    timestamps: true,
    paranoid: false
  });

  return SProductionOrderProduct;
};