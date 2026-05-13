/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('t_material_receiving_item_label', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      mr_item_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 't_material_receiving_item',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      label_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 't_part_labels',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      is_quantity: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_quality: {
        allowNull: true,
        type: Sequelize.BOOLEAN
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

    await queryInterface.addConstraint('t_material_receiving_item_label', {
      fields: ['mr_item_id', 'label_id'],
      type: 'unique',
      name: 'unique_mr_item_label'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('t_material_receiving_item_label');
  }
};