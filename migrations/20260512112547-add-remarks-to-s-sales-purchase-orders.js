/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_sales_purchase_orders', 'remarks', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Rejection or other notes'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('s_sales_purchase_orders', 'remarks');
  }
};
