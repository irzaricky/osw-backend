/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_ng_ticket_quality', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      ng_ticket_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 't_ng_ticket',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      defect_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_defects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      image: {
        allowNull: true,
        type: Sequelize.STRING(255)
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

    await queryInterface.addIndex('t_ng_ticket_quality', ['ng_ticket_id', 'defect_id'], {
      unique: true,
      name: 'unique_ng_ticket_defect'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_ng_ticket_quality');
  }
};