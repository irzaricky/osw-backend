/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_work_order_storing', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      wo_number: {
        allowNull: false,
        unique: true,
        type: Sequelize.STRING(80)
      },

      wo_category: {
        allowNull: false,
        type: Sequelize.ENUM('Placement', 'Take Out')
      },

      ref_doc_number: {
        allowNull: true,
        type: Sequelize.STRING(120)
      },

      ref_doc_name: {
        allowNull: true,
        type: Sequelize.STRING(255)
      },

      wo_date: {
        allowNull: false,
        type: Sequelize.DATEONLY
      },

      wo_description: {
        allowNull: true,
        type: Sequelize.TEXT
      },

      wo_type_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 'ref_work_order_storing_type',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      warehouse_area_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_warehouse_areas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      wo_status_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 'ref_work_order_storing_status',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      created_by: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: {
          model: 's_users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
    await queryInterface.dropTable('t_work_order_storing');
  }
};
