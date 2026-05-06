export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    const customers = [
      { customer_code: 'C001', name: 'PT Sejahtera Abadi Motor', email: 'dummy@sejahteraabadi.co.id', address: 'Jl. Jend. Sudirman No. 45, Jakarta Pusat, DKI Jakarta', ...timestamp },
      { customer_code: 'C002', name: 'CV Maju Jaya Electric', email: 'dummy@majujaya-electric.com', address: 'Jl. Ahmad Yani No. 88, Surabaya, Jawa Timur', ...timestamp },
      { customer_code: 'C003', name: 'PT E-Bike Nusantara', email: 'dummy@ebike-nusantara.id', address: 'Kawasan Industri Cikarang Blok B-2, Bekasi, Jawa Barat', ...timestamp },
      { customer_code: 'C004', name: 'PT Distribusi Roda Dua', email: 'dummy@distro2.co.id', address: 'Jl. Pemuda No. 50, Semarang, Jawa Tengah', ...timestamp },
      { customer_code: 'C005', name: 'CV Bintang Terang', email: 'dummy@bintangterang.net', address: 'Jl. Teuku Umar No. 22, Denpasar, Bali', ...timestamp },
      { customer_code: 'C006', name: 'PT Green Mobility Indonesia', email: 'dummy@greenmobility.id', address: 'BSD City Business Park, Tangerang Selatan, Banten', ...timestamp }
    ];

    await queryInterface.bulkInsert('s_customers', customers, { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_customers', null, {});
  }
};
