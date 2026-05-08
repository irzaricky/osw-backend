/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_area_layouts', 'wh_layout_id', {
      allowNull: false,
      type: Sequelize.INTEGER,
      references: {
        model: 's_warehouse_layouts',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    await queryInterface.addIndex('s_area_layouts', ['wh_layout_id']);

    await queryInterface.addConstraint('s_area_layouts', {
      fields: ['wh_layout_id', 'area_id'],
      type: 'unique',
      name: 'uq_s_area_layouts_wh_layout_area'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      's_area_layouts',
      'uq_s_area_layouts_wh_layout_area'
    );

    await queryInterface.removeIndex(
      's_area_layouts',
      ['wh_layout_id']
    );

    await queryInterface.removeColumn(
      's_area_layouts',
      'wh_layout_id'
    );
  }
};