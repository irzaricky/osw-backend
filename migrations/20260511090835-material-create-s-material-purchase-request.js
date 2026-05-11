'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_material_purchase_requests', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      mrp_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 's_mrps', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      number: {
        type: Sequelize.STRING
      },
      description: {
        type: Sequelize.STRING
      },
      request_date: {
        type: Sequelize.DATEONLY
      },
      type: {
        type: Sequelize.STRING
      },
      status: {
        type: Sequelize.STRING
      },
      remarks: {
        type: Sequelize.TEXT
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 's_users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      approved_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 's_users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
    await queryInterface.dropTable('s_material_purchase_requests');
  }
};