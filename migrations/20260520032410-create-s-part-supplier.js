'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_part_suppliers', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      part_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_parts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      supplier_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 's_suppliers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: 'Marks the preferred/main supplier for this part',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Unique constraint: satu part tidak bisa punya supplier yang sama dua kali
    await queryInterface.addIndex('s_part_suppliers', ['part_id', 'supplier_id'], {
      unique: true,
      name: 'uq_part_supplier',
    });

    // Index untuk lookup cepat dari sisi supplier
    await queryInterface.addIndex('s_part_suppliers', ['supplier_id'], {
      name: 'idx_part_suppliers_supplier_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('s_part_suppliers');
  },
};