/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_area_spacing', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      area_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_warehouse_areas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      col_index: {
        allowNull: false,
        type: Sequelize.INTEGER
      },

      col_spacing: {
        allowNull: false,
        type: Sequelize.INTEGER
      },

      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },

      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },

      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('s_area_spacing', ['area_id']);
    await queryInterface.addIndex('s_area_spacing', ['area_id', 'col_index']);

    await queryInterface.addConstraint('s_area_spacing', {
      fields: ['area_id', 'col_index'],
      type: 'unique',
      name: 'uq_s_area_spacing_area_col'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_area_spacing');
  }
};