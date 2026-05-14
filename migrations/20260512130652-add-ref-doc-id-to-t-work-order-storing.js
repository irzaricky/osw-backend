/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('t_work_order_storing', 'ref_doc_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 't_material_receiving',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('t_work_order_storing', 'ref_doc_id')
  }
}