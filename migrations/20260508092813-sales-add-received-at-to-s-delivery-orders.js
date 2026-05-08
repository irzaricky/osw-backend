/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_delivery_orders', 'received_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Waktu barang diterima oleh pelanggan'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('s_delivery_orders', 'received_at');
  }
};
