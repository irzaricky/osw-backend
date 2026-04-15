/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_work_order_storing_item', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      wo_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 't_work_order_storing',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      part_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_parts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      total_kanban: {
        allowNull: false,
        type: Sequelize.INTEGER
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_work_order_storing_item');
  }
};
