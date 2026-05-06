/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_delivery_orders', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      do_number: {
        allowNull: false,
        type: Sequelize.STRING(50)
      },
      delivery_plan_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_delivery_plans',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      customer_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      vehicle_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_vehicles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      driver_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_users_details',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'Mengacu ke s_user_details untuk data karyawan/supir'
      },
      shipment_date: {
        allowNull: false,
        type: Sequelize.DATEONLY
      },
      delivery_status: {
        allowNull: false,
        defaultValue: 'In Transit',
        type: Sequelize.STRING(50),
        comment: 'In Transit, Delivered'
      },
      proof_of_delivery: {
        allowNull: true,
        type: Sequelize.STRING(255),
        comment: 'Path/URL ke gambar Bukti Pengiriman'
      },
      notes: {
        type: Sequelize.TEXT
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
    await queryInterface.dropTable('s_delivery_orders');
  }
};
