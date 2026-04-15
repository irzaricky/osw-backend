/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_work_order_storing_item_label', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      wo_item_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 't_work_order_storing_item',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      label_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 't_part_labels',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      is_scanned_in: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },

      is_scanned_out: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false
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

    await queryInterface.addIndex('t_work_order_storing_item_label', ['wo_item_id']);
    await queryInterface.addIndex('t_work_order_storing_item_label', ['label_id']);

    await queryInterface.addConstraint('t_work_order_storing_item_label', {
      fields: ['label_id'],
      type: 'unique',
      name: 'uq_work_order_storing_item_label_label_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_work_order_storing_item_label');
  }
};
