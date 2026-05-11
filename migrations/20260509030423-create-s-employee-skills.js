export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_employee_skills', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      member_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_employee_group_members',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      skill_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_skills',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      level: {
        type: Sequelize.INTEGER,
        defaultValue: 1, // 1–5
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
    await queryInterface.dropTable('s_employee_skills');
  },
};