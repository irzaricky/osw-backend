'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_delivery_orders', 'loading_photo_url', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
    await queryInterface.addColumn('s_delivery_orders', 'dispatch_approved_by', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('s_delivery_orders', 'dispatch_approved_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('s_delivery_orders', 'loading_photo_url');
    await queryInterface.removeColumn('s_delivery_orders', 'dispatch_approved_by');
    await queryInterface.removeColumn('s_delivery_orders', 'dispatch_approved_at');
  }
};
