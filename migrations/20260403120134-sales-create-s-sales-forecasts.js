/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_sales_forecasts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      customer_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      forecast_number: {
        allowNull: false,
        unique: true,
        type: Sequelize.STRING(50)
      },
      forecast_type: {
        allowNull: false,
        type: Sequelize.STRING(50),
        comment: 'Yearly, Half-Year, 4-Month'
      },
      start_period: {
        allowNull: false,
        type: Sequelize.DATEONLY
      },
      end_period: {
        allowNull: false,
        type: Sequelize.DATEONLY
      },
      description: {
        type: Sequelize.TEXT
      },
      version: {
        allowNull: false,
        defaultValue: 'V1',
        type: Sequelize.STRING(20)
      },
      status: {
        allowNull: false,
        defaultValue: 'Draft',
        type: Sequelize.STRING(50),
        comment: 'Draft, Submitted, Approved, Rejected'
      },
      copied_from_id: {
        type: Sequelize.INTEGER,
        comment: 'Self-reference jika copy data dari forecast sebelumnya'
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
      approved_by: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: {
          model: 's_users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      approved_at: {
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
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('s_sales_forecasts');
  }
};
