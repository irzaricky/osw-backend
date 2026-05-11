/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_sales_purchase_request_logs', 'snapshot', {
      type: Sequelize.JSON,
      allowNull: true,
      after: 'remarks'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('s_sales_purchase_request_logs', 'snapshot');
  }
};
