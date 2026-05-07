/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_warehouse_layouts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      warehouse_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_warehouses',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
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

    await queryInterface.addIndex('s_warehouse_layouts', ['warehouse_id']);

    await queryInterface.addConstraint('s_warehouse_layouts', {
      fields: ['warehouse_id'],
      type: 'unique',
      name: 'uq_s_warehouse_layouts_warehouse_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_warehouse_layouts');
  }
};