/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_material_receiving', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      mdo_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_material_delivery_orders',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      received_at: {
        allowNull: true,
        type: Sequelize.DATE
      },
      received_by: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: {
          model: 's_users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      remarks: {
        allowNull: true,
        type: Sequelize.TEXT
      },
      status_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 'ref_receiving_status',
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_material_receiving');
  }
};