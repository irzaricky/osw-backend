/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_delivery_order_details', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      delivery_order_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_delivery_orders',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      delivery_plan_detail_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_delivery_plan_details',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      sent_qty: {
        allowNull: false,
        type: Sequelize.INTEGER,
        comment: 'Jumlah aktual barang yang dikirim/dimuat'
      },
      received_qty: {
        allowNull: true,
        type: Sequelize.INTEGER,
        comment: 'Jumlah barang yang benar-benar diterima pelanggan'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Catatan spesifik per item (jika ada barang rusak/kurang saat muat)'
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
    await queryInterface.dropTable('s_delivery_order_details');
  }
};
