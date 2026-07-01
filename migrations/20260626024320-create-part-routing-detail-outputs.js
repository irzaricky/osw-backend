'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     * s_part_routing_detail_outputs
  - id
  - routing_detail_id (FK ke s_part_routing_details)
  - output_part_id (FK ke s_parts)
  - created_at / updated_at
     */
    await queryInterface.createTable('s_part_routing_detail_outputs', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      routing_detail_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_part_routing_details', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      output_part_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_parts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.dropTable('s_part_routing_detail_outputs');
  }
};
