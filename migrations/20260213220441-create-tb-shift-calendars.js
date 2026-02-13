/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_shift_calendars', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      line_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_lines',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      shift_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_shifts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      start_date: {
        allowNull: false,
        type: Sequelize.DATEONLY
      },
      end_date: {
        allowNull: false,
        type: Sequelize.DATEONLY
      },
      date_category: {
        allowNull: false,
        type: Sequelize.STRING(50) // WEEKDAY, WEEKEND
      },
      date_event: {
        allowNull: false,
        type: Sequelize.STRING(100)
      },
      active: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    // Add indexes
    await queryInterface.addIndex('s_shift_calendars', ['line_id', 'shift_id', 'start_date', 'end_date'], {
      name: 'idx_shift_calendars_lookup'
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('s_shift_calendars');
  }
};
