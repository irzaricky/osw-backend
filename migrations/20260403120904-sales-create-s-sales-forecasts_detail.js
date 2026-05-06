/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_sales_forecast_details', {
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
      forecast_detail_number: {
        allowNull: false,
        type: Sequelize.STRING(50)
      },
      part_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_parts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'Mengacu ke s_parts untuk data produk'
      },
      period_date: {
        allowNull: true,
        type: Sequelize.DATEONLY
      },
      qty_status: {
        allowNull: false,
        type: Sequelize.STRING(20),
        defaultValue: 'Temporary',
        comment: 'Fix, Temporary'
      },
      forecast_qty: {
        allowNull: false,
        defaultValue: 0,
        type: Sequelize.INTEGER
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
    await queryInterface.dropTable('s_sales_forecast_details');
  }
};
