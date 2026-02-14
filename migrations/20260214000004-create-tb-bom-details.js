/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_bom_details', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      bom_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_boms',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      part_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_parts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'The child component part'
      },
      qty_required: {
        allowNull: false,
        type: Sequelize.DECIMAL(10, 4),
        defaultValue: 1
      },
      level: {
        allowNull: true,
        type: Sequelize.INTEGER
      },
      type: {
        allowNull: true,
        type: Sequelize.STRING(50)
      },
      child_bom_number: {
        allowNull: true,
        type: Sequelize.STRING(100),
        comment: 'Reference to another BOM if this part is a sub-assembly'
      },
      notes: {
        allowNull: true,
        type: Sequelize.TEXT
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
    await queryInterface.dropTable('s_bom_details');
  }
};
