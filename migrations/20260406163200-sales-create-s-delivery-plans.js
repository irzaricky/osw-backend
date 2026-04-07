/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_delivery_plans', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      dp_number: {
        allowNull: false,
        unique: true,
        type: Sequelize.STRING(50)
      },
      scheduled_date: {
        allowNull: false,
        type: Sequelize.DATEONLY
      },
      time_start: {
        allowNull: false,
        type: Sequelize.TIME
      },
      time_end: {
        allowNull: false,
        type: Sequelize.TIME
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
      dock_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_docks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      destination: {
        allowNull: false,
        type: Sequelize.TEXT
      },
      status: {
        allowNull: false,
        defaultValue: 'Draft',
        type: Sequelize.STRING(50),
        comment: 'Draft, Scheduled, Shipped'
      },
      created_by: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_users',
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
        type: Sequelize.DATE
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('s_delivery_plans');
  }
};
