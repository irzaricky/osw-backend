/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_sales_purchase_order_details', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      spo_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_sales_purchase_orders',
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
      ordered_qty: {
        allowNull: false,
        defaultValue: 0,
        type: Sequelize.INTEGER
      },
      sent_qty: {
        allowNull: false,
        defaultValue: 0,
        type: Sequelize.INTEGER,
        comment: 'Jumlah yang sudah terkirim'
      },
      last_shipment_date: {
        allowNull: true,
        type: Sequelize.DATEONLY,
        comment: 'Tanggal pengiriman terakhir'
      },
      status: {
        allowNull: false,
        defaultValue: 'Open',
        type: Sequelize.STRING(20),
        comment: 'Open, Partial, Closed'
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
    await queryInterface.dropTable('s_sales_purchase_order_details');
  }
};
