/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_vehicles', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      vehicle_code: {
        allowNull: false,
        type: Sequelize.STRING(20)
      },
      plate_number: {
        allowNull: false,
        type: Sequelize.STRING(20)
      },
      vehicle_type_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 'ref_vehicle_types',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      image: {
        allowNull: true,
        type: Sequelize.STRING(255)
      },
      status: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Active/Inactive'
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
    await queryInterface.dropTable('s_vehicles');
  }
};