'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    /**
     * Add seed commands here.
     *
     * Example:
     * await queryInterface.bulkInsert('People', [{
     *   name: 'John Doe',
     *   isBetaMember: false
     * }], {});
     * drop column bottleneck_line_id from s_production_plans table
     * drop column is_bottleneck from s_part_routing_details table
    */
    await queryInterface.removeColumn('s_production_plans', 'bottleneck_line_id');
    await queryInterface.removeColumn('s_part_routing_details', 'is_bottleneck');
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add commands to revert seed here.
     *
     * Example:
     * await queryInterface.bulkDelete('People', null, {});
    add column bottleneck_line_id to s_production_plans table
    add column is_bottleneck to s_part_routing_details table
     */
    await queryInterface.addColumn('s_production_plans', 'bottleneck_line_id', {  
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_lines',
        key: 'id'
      },
    });

    await queryInterface.addColumn('s_part_routing_details', 'is_bottleneck', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
  }
};
