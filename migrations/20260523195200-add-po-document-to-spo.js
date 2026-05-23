'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_sales_purchase_orders', 'po_document', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('s_sales_purchase_orders', 'po_document');
  }
};
