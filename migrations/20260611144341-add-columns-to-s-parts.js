/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_parts', 'standard_buffer_stock', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    await queryInterface.addColumn('s_parts', 'weight_per_pcs', {
      type: Sequelize.DECIMAL(10, 3),
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('s_parts', 'weight_per_pcs');
    await queryInterface.removeColumn('s_parts', 'standard_buffer_stock');
  }
};