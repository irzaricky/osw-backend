/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_sales_forecast_logs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      forecast_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_sales_forecasts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      version: {
        allowNull: false,
        type: Sequelize.STRING(20)
      },
      total_qty: {
        type: Sequelize.INTEGER
      },
      action: {
        type: Sequelize.STRING(50),
        comment: 'Contoh: Submit, Approve, Reject, Update'
      },
      remarks: {
        type: Sequelize.TEXT,
        comment: 'Catatan dari proses review & approval'
      },
      changed_by: {
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
      }
    }, {
      comment: 'Digunakan untuk merekam riwayat versi saat submit/approval'
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('s_sales_forecast_logs');
  }
};
