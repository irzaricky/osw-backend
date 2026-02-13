/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_warehouse_bins', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      bin_code: {
        allowNull: false,
        unique: true,
        type: Sequelize.STRING(50)
      },
      area_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_warehouse_areas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      row_index: {
        allowNull: false,
        type: Sequelize.INTEGER
      },
      col_index: {
        allowNull: false,
        type: Sequelize.INTEGER
      },
      is_dedicated: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      dedicated_part_number: {
        allowNull: true,
        type: Sequelize.STRING(100)
      },
      capacity: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 0
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
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('s_warehouse_bins');
  }
};
