/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('s_area_spacing', 'uq_s_area_spacing_area_col');
    await queryInterface.removeIndex('s_area_spacing', ['area_id']);
    await queryInterface.removeIndex('s_area_spacing', ['area_id', 'col_index']);
    await queryInterface.removeColumn('s_area_spacing', 'area_id');

    await queryInterface.addColumn('s_area_spacing', 'area_layout_id', {
      allowNull: false,
      type: Sequelize.INTEGER,
      references: {
        model: 's_area_layouts',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    await queryInterface.addIndex('s_area_spacing', ['area_layout_id']);
    await queryInterface.addIndex('s_area_spacing', ['area_layout_id', 'col_index']);

    await queryInterface.addConstraint('s_area_spacing', {
      fields: ['area_layout_id', 'col_index'],
      type: 'unique',
      name: 'uq_s_area_spacing_layout_col'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      's_area_spacing',
      'uq_s_area_spacing_layout_col'
    );

    await queryInterface.removeIndex(
      's_area_spacing',
      ['area_layout_id']
    );

    await queryInterface.removeIndex(
      's_area_spacing',
      ['area_layout_id', 'col_index']
    );

    await queryInterface.removeColumn(
      's_area_spacing',
      'area_layout_id'
    );

    await queryInterface.addColumn(
      's_area_spacing',
      'area_id',
      {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_warehouse_areas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      }
    );

    await queryInterface.addIndex(
      's_area_spacing',
      ['area_id']
    );

    await queryInterface.addIndex(
      's_area_spacing',
      ['area_id', 'col_index']
    );

    await queryInterface.addConstraint(
      's_area_spacing',
      {
        fields: ['area_id', 'col_index'],
        type: 'unique',
        name: 'uq_s_area_spacing_area_col'
      }
    );
  }
};