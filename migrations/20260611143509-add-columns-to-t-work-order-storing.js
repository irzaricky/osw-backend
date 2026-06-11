/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('t_work_order_storing', 'take_out_purpose', {
      type: Sequelize.ENUM('production', 'buffer'),
      allowNull: true
    });

    await queryInterface.addColumn('t_work_order_storing', 'production_wo_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_work_orders',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('t_work_order_storing', 'station_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_stations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('t_work_order_storing', 'station_id');
    await queryInterface.removeColumn('t_work_order_storing', 'production_wo_id');
    await queryInterface.removeColumn('t_work_order_storing', 'take_out_purpose');

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_t_work_order_storing_take_out_purpose";'
    );
  }
};