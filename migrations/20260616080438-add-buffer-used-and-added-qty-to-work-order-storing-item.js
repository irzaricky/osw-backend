/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('t_work_order_storing_item', 'buffer_used_qty_pcs', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Quantity taken from buffer stock (pcs)'
    });

    await queryInterface.addColumn('t_work_order_storing_item', 'buffer_added_qty_pcs', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Excess quantity added to buffer stock (pcs)'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('t_work_order_storing_item', 'buffer_added_qty_pcs');
    await queryInterface.removeColumn('t_work_order_storing_item', 'buffer_used_qty_pcs');
  }
};