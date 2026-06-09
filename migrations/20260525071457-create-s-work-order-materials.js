export default {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Membuat tabel s_work_order_materials untuk menyimpan hasil BOM Explosion per WO
      await queryInterface.createTable('s_work_order_materials', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        wo_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 's_work_orders',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        material_part_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 's_parts', // Mengacu pada master komponen/part Anda
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        planned_quantity: {
          type: Sequelize.DECIMAL(14, 4),
          allowNull: false,
          defaultValue: 0.0000
        },
        actual_quantity: {
          type: Sequelize.DECIMAL(14, 4),
          allowNull: true,
          defaultValue: 0.0000
        },
        uom: {
          type: Sequelize.STRING(50),
          allowNull: true
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
          type: Sequelize.DATE,
          allowNull: true
        }
      }, { transaction });

      // 2. Menambahkan kolom operator_id ke s_work_order_station_jobs (Mekanisme QR Code Dinamis)
      // Kolom dibuat ALLOW NULL karena operator baru melakukan assignment secara real-time saat scan di lapangan
      await queryInterface.addColumn('s_work_order_station_jobs', 'operator_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 's_employees', // Sesuaikan dengan nama tabel master karyawan/operator Anda (misal: users atau s_employees)
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Hapus kolom operator_id dari s_work_order_station_jobs
      await queryInterface.removeColumn('s_work_order_station_jobs', 'operator_id', { transaction });

      // 2. Drop tabel s_work_order_materials
      await queryInterface.dropTable('s_work_order_materials', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};