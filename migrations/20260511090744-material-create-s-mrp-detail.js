'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_mrp_details', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      mrp_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_mrps', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      part_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_parts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      bom_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 's_boms', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      qty: {
        type: Sequelize.DECIMAL
      },
      notes: {
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
    await queryInterface.dropTable('s_mrp_details');
  }
};