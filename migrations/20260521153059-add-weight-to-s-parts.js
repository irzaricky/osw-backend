'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('s_parts', 'weight', {
      type: Sequelize.DECIMAL(10, 3),
      allowNull: true,
      defaultValue: null,
      comment: 'Berat per unit dalam kilogram (kg). Digunakan untuk menghitung apakah muatan melebihi kapasitas kendaraan.',
      after: 'package_id', // opsional: agar kolom muncul di posisi yang rapi
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('s_parts', 'weight');
  },
};