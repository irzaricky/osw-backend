/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_sales_purchase_requests', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      spr_number: {
        allowNull: false,
        type: Sequelize.STRING(50)
      },
      spr_name: {
        allowNull: false,
        type: Sequelize.STRING(100)
      },
      source: {
        allowNull: false,
        type: Sequelize.STRING(50),
        comment: 'Automatic (dari Forecast) / Manual'
      },
      forecast_id: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: {
          model: 's_sales_forecasts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Terisi jika source = Automatic'
      },
      request_date: {
        allowNull: false,
        type: Sequelize.DATEONLY,
        defaultValue: Sequelize.literal('CURRENT_DATE')
      },
      required_date: {
        allowNull: false,
        type: Sequelize.DATEONLY
      },
      confirmed_date: {
        allowNull: true,
        type: Sequelize.DATEONLY,
        comment: 'Diisi oleh PPIC saat konfirmasi'
      },
      description: {
        type: Sequelize.TEXT
      },
      status: {
        allowNull: false,
        defaultValue: 'Draft',
        type: Sequelize.STRING(50),
        comment: 'Draft, Waiting PPIC, Approved, Rejected'
      },
      remarks: {
        type: Sequelize.TEXT,
        comment: 'Catatan approval dari PPIC'
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
        onDelete: 'SET NULL',
        comment: 'User (PPIC/Supervisor) yang melakukan approval'
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
    await queryInterface.dropTable('s_sales_purchase_requests');
  }
};
