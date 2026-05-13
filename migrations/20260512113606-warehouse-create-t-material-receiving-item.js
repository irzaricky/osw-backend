/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_material_receiving_item', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      mr_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 't_material_receiving',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      mdo_detail_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_material_delivery_order_details',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      quantity_checked: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      quantity_checked_at: {
        allowNull: true,
        type: Sequelize.DATE
      },
      quality_checked: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      quality_checked_at: {
        allowNull: true,
        type: Sequelize.DATE
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
    await queryInterface.dropTable('t_material_receiving_item');
  }
};