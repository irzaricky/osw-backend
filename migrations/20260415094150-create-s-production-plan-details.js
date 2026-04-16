export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_production_plan_details', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      plan_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_production_plans', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },

      sequence: { type: Sequelize.INTEGER, defaultValue: 0 },

      do_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_delivery_orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      do_detail_id: { 
        type: Sequelize.INTEGER, 
        allowNull: false, 
        references: { model: 's_delivery_order_details', key: 'id' }, 
        onUpdate: 'CASCADE', 
        onDelete: 'RESTRICT' 
      },

      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_customers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      part_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_parts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      delivery_date: { type: Sequelize.DATEONLY, allowNull: false },
      qty_request: { type: Sequelize.INTEGER, allowNull: false },

      qty_capacity: Sequelize.INTEGER,
      capacity_gap: Sequelize.INTEGER,
      status: Sequelize.STRING(50),

      notes: Sequelize.TEXT,

      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      deleted_at: Sequelize.DATE
    });

    await queryInterface.addConstraint('s_production_plan_details', {
      fields: ['plan_header_id', 'sequence'],
      type: 'unique',
      name: 'uniq_plan_sequence'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_production_plan_details');
  }
};