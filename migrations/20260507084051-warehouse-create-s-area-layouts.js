/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_area_layouts', {
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

      start_row: {
        allowNull: false,
        type: Sequelize.INTEGER
      },

      start_col: {
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

    await queryInterface.addIndex('s_area_layouts', ['area_id']);

    await queryInterface.addConstraint('s_area_layouts', {
      fields: ['area_id'],
      type: 'unique',
      name: 'uq_s_area_layouts_area_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_area_layouts');
  }
};