/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_warehouse_stock', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      wo_item_label_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 't_work_order_storing_item_label',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      bin_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_warehouse_bins',
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

    await queryInterface.addConstraint('t_warehouse_stock', {
      fields: ['wo_item_label_id'],
      type: 'unique',
      name: 'uq_warehouse_stock_wo_item_label_id'
    });

    await queryInterface.addIndex('t_warehouse_stock', ['bin_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_warehouse_stock');
  }
};
