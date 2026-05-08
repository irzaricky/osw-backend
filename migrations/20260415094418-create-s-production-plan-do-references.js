export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_production_plan_do_references', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },

      plan_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_production_plans', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      do_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_delivery_orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    await queryInterface.addConstraint('s_production_plan_do_references', {
      fields: ['plan_id', 'do_header_id'],
      type: 'unique',
      name: 'uniq_plan_do'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_production_plan_do_references');
  }
};