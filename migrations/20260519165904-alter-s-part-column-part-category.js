/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    // ganti column part_category_id di table s_parts menjadi part_category dengan tipe data string
    await queryInterface.removeColumn('s_parts', 'part_category_id');
    await queryInterface.addColumn('s_parts', 'part_category', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    // kembalikan column part_category menjadi part_category_id dengan tipe data integer
    await queryInterface.removeColumn('s_parts', 'part_category');
    await queryInterface.addColumn('s_parts', 'part_category_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  }
};
