'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.createTable('s_routing_station_materials', {
      id: {
        type:          Sequelize.DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
      },
      routing_id: {
        type:       Sequelize.DataTypes.INTEGER,
        allowNull:  false,
        references: { model: 's_part_routings', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'RESTRICT',
      },
      station_id: {
        type:       Sequelize.DataTypes.INTEGER,
        allowNull:  false,
        references: { model: 's_stations', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'RESTRICT',
      },
      part_id: {
        type:       Sequelize.DataTypes.INTEGER,
        allowNull:  false,
        references: { model: 's_parts', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'RESTRICT',
      },
      qty_per_unit: {
        type:         Sequelize.DataTypes.DECIMAL(14, 4),
        allowNull:    false,
        defaultValue: 1.0000,
      },
      uom: {
        type:         Sequelize.DataTypes.STRING(50),
        allowNull:    false,
        defaultValue: 'PCS',
      },
      created_at: {
        type:         Sequelize.DataTypes.DATE,
        allowNull:    false,
        defaultValue: Sequelize.DataTypes.NOW,
      },
      updated_at: {
        type:         Sequelize.DataTypes.DATE,
        allowNull:    false,
        defaultValue: Sequelize.DataTypes.NOW,
      },
    });
    
    await queryInterface.addIndex('s_routing_station_materials', ['routing_id', 'station_id']);
    await queryInterface.addIndex('s_routing_station_materials', ['station_id', 'part_id']);
    await queryInterface.addConstraint('s_routing_station_materials', {
      fields: ['routing_id', 'station_id', 'part_id'],
      type:   'unique',
      name:   'uq_routing_station_material',
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.dropTable('s_routing_station_materials');
  }
};
