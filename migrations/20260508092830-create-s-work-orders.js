export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_work_orders', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      wo_number: { allowNull: false, unique: true, type: Sequelize.STRING(50) },

      po_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_production_orders', key: 'id' }
      },

      po_schedule_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_production_order_schedules', key: 'id' }
      },

      part_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_parts', key: 'id' }
      },

      line_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_lines', key: 'id' }
      },

      factory_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_factories', key: 'id' }
      },

      shift_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 's_shifts', key: 'id' }
      },

      work_date: { allowNull: false, type: Sequelize.DATEONLY },

      planned_quantity: { allowNull: false, type: Sequelize.INTEGER },
      actual_quantity: { defaultValue: 0, type: Sequelize.INTEGER },

      status: { allowNull: false, defaultValue: 'Released', type: Sequelize.STRING(50) },

      supervisor: { type: Sequelize.STRING(100) },

      sequence: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },

      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      deleted_at: { type: Sequelize.DATE }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_work_orders');
  }
};