export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    const suppliers = [
      { supplier_code: 'S001', name: 'ACCELERATED SYSTEMS GLOBAL INC', email: 'acceleratedsystem@dummy.com', notes: 'Supply Rangka & Logam', ...timestamp },
      { supplier_code: 'S002', name: 'AKEBONO BATTERY ASTRA INDONESIA PT', email: 'akebonobattery@dummy.com', notes: 'Supply Baterai & Elektronik', ...timestamp },
      { supplier_code: 'S003', name: 'ASIANET BATTERY INDONESIA PT', email: 'asianetspring@dummy.com', notes: 'Supply Baterai & Elektronik', ...timestamp },
      { supplier_code: 'S004', name: 'ASTRA KOMPONEN INDONESIA PT', email: 'astrakomponen@dummy.com', notes: 'Supply Baut & Bearing', ...timestamp },
      { supplier_code: 'S005', name: 'ASTRA OTOPARTS TBK DIVISI NUSAMETAL PT', email: 'astraotopartnusa@dummy.com', notes: 'Supply Baut & Bearing', ...timestamp },
      { supplier_code: 'S006', name: 'ASTRA OTOPARTS TBK PT', email: 'astraotopart@dummy.com', notes: 'Supply Rangka & Logam', ...timestamp },
      { supplier_code: 'S007', name: 'CABLE TECH PT', email: 'cabletech@dummy.com', notes: 'Supply Baterai & Elektronik', ...timestamp },
      { supplier_code: 'S008', name: 'CHANGZHOU DEPU ELECTRIC APPLIANCE CO LTD', email: 'changzhoudepu@dummy.com', notes: 'Supply Baterai & Elektronik', ...timestamp },
      { supplier_code: 'S009', name: 'CHANGZHOU WUJIN BLECTOR ELECTRONIC CO LTD', email: 'changzouwujin@dummy.com', notes: 'Supply Baterai & Elektronik', ...timestamp },
      { supplier_code: 'S010', name: 'DAIJO INDUSTRIAL PT', email: 'daijoindustrial@dummy.com', notes: 'Supply Rangka & Logam', ...timestamp },
      { supplier_code: 'S011', name: 'DHARMA ELECTRINDO MANUFACTURING PT', email: 'dharmaelectric@dummy.com', notes: 'Supply Baterai & Elektronik', ...timestamp },
      { supplier_code: 'S012', name: 'DHARMA POLIMETAL PT', email: 'dharmapolimetal@dummy.com', notes: 'Supply Baut & Bearing', ...timestamp },
      { supplier_code: 'S013', name: 'DHARMA POLIPLAST PT', email: 'dharmapoliplast@dummy.com', notes: 'Supply Baut & Bearing', ...timestamp },
      { supplier_code: 'S014', name: 'DONGGUAN TIANRUI ELECTRONICS CO LTD', email: 'dongguantianrui@dummy.com', notes: 'Supply Baterai & Elektronik', ...timestamp },
      { supplier_code: 'S015', name: 'DONGGUAN ZHUOSHI TECHNOLOGY CO LTD', email: 'dongguanzhuoshi@dummy.com', notes: 'Supply Baterai & Elektronik', ...timestamp },
      { supplier_code: 'S016', name: 'EFATA MITRA MANDIRI PT', email: 'efatamandiri@dummy.com', notes: 'Supply Ban & Karet', ...timestamp },
      { supplier_code: 'S017', name: 'ELESUN NEW FRAME PT', email: 'elesunframe@dummy.com', notes: 'Supply Rangka & Logam', ...timestamp },
      { supplier_code: 'S018', name: 'FUJI SEIMITSU PT', email: 'fujiseimitsu@dummy.com', notes: 'Supply Ban & Karet', ...timestamp },
      { supplier_code: 'S019', name: 'GARUDA METALINDO TBK PT', email: 'garudametalindo@dummy.com', notes: 'Supply Rangka & Logam', ...timestamp },
      { supplier_code: 'S020', name: 'GARUDA METAL UTAMA PT', email: 'garudametalutama@dummy.com', notes: 'Supply Rangka & Logam', ...timestamp }
    ];

    await queryInterface.bulkInsert('s_suppliers', suppliers, { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_suppliers', null, {});
  }
};
