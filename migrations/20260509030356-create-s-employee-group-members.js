export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_employee_group_members', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      group_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_employee_groups',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      employee_code: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },

      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      position_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      skill_level: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
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
    await queryInterface.dropTable('s_employee_group_members');
  },
};