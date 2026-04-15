/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_warehouse_stock_log', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      wh_stock_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 't_warehouse_stock',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      user_id: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: {
          model: 's_users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      is_placement: {
        allowNull: false,
        type: Sequelize.BOOLEAN
      },

      qty_per_kanban: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 1
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

    await queryInterface.addIndex('t_warehouse_stock_log', ['wh_stock_id']);
    await queryInterface.addIndex('t_warehouse_stock_log', ['user_id']);
    await queryInterface.addIndex('t_warehouse_stock_log', ['is_placement']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_warehouse_stock_log');
  }
};
