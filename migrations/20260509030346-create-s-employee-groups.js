export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_employee_groups', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      line_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_lines',
          key: 'id',
        },
        onDelete: 'RESTRICT',
      },

      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },

      leader_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_users',
          key: 'id',
        },
        onDelete: 'RESTRICT',
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },

      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },

      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_employee_groups');
  },
};