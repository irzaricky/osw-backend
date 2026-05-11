export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_line_capacity_params', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },

      line_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_lines',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },

      default_working_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 22,
      },

      default_shifts_per_day: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      default_working_hours_per_shift: {
        type: Sequelize.DECIMAL(5,2),
        allowNull: false,
        defaultValue: 7,
      },

      default_efficiency_factor: {
        type: Sequelize.DECIMAL(5,4),
        allowNull: false,
        defaultValue: 0.85,
      },

      default_overtime_hours: {
        type: Sequelize.DECIMAL(5,2),
        allowNull: false,
        defaultValue: 0,
      },

      default_manpower: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 10,
      },

      default_max_takt_time: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 60,
      },

      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },

      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addConstraint('s_line_capacity_params', {
      fields: ['line_id'],
      type: 'unique',
      name: 'uniq_line_capacity_param',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_line_capacity_params');
  },
};