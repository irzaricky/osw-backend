'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_parts', 'package_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_packages',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('s_parts', 'package_id');
  }
};