import bcrypt from 'bcryptjs';
 
export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };
    const saltRounds = 10;
    const defaultPassword = await bcrypt.hash('password123', saltRounds);
 
    // Helpers
    const getRoleId = async (name) => {
      // Handle mapping differences if any
      let targetName = name;
      if (name === 'Warehouse Leader') targetName = 'Supervisor Warehouse';
 
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_roles WHERE name = '${targetName}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      if (!result[0]) console.warn(`Role '${name}' (mapped: '${targetName}') not found.`);
      return result[0]?.id;
    };
 
    const getFactoryId = async (name) => {
      if (!name) return null;
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_factories WHERE name = '${name}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return result[0]?.id;
    };
 
    const getLineId = async (name) => {
      if (!name) return null;
      const result = await queryInterface.sequelize.query(
        `SELECT id FROM s_lines WHERE name = '${name}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return result[0]?.id;
    };

    const rawData = [
  {
    full_name: 'Andi Pratama',
    emp_no: 'EMP-001',
    factory: null,
    line: null,
    phone: '8123456001',
    email: 'andi.pratama@company.com',
    role: 'Superadmin'
  },
  {
    full_name: 'Budi Santoso',
    emp_no: 'EMP-002',
    factory: null,
    line: null,
    phone: '8123456002',
    email: 'budi.santoso@company.com',
    role: 'Staff Sales Forecast'
  },
  {
    full_name: 'Citra Lestari',
    emp_no: 'EMP-003',
    factory: null,
    line: null,
    phone: '8123456003',
    email: 'citra.lestari@company.com',
    role: 'Supervisor Sales Forecast'
  },
  {
    full_name: 'Dewi Anggraini',
    emp_no: 'EMP-004',
    factory: null,
    line: null,
    phone: '8123456004',
    email: 'dewi.anggraini@company.com',
    role: 'Staff Sales Order'
  },
  {
    full_name: 'Eko Nugroho',
    emp_no: 'EMP-005',
    factory: null,
    line: null,
    phone: '8123456005',
    email: 'eko.nugroho@company.com',
    role: 'Supervisor Sales Order'
  },
  {
    full_name: 'Fajar Hidayat',
    emp_no: 'EMP-006',
    factory: null,
    line: null,
    phone: '8123456006',
    email: 'fajar.hidayat@company.com',
    role: 'Staff Sales Delivery'
  },
  {
    full_name: 'Rina Wulandari',
    emp_no: 'EMP-007',
    factory: null,
    line: null,
    phone: '8123456007',
    email: 'rina.wulandari@company.com',
    role: 'Supervisor Sales Delivery'
  },
  {
    full_name: 'Umar Winarno',
    emp_no: 'EMP-008',
    factory: null,
    line: null,
    phone: '8123456008',
    email: 'umar.winarno@company.com',
    role: 'Admin sales'
  },
  {
    full_name: 'Harsanto Anggriawan',
    emp_no: 'EMP-009',
    factory: null,
    line: null,
    phone: '8123456009',
    email: 'harsanto@company.com',
    role: 'Warehouse Staff'
  },
  {
    full_name: 'Yuliana Lailasari',
    emp_no: 'EMP-010',
    factory: null,
    line: null,
    phone: '8123456010',
    email: 'yuliana@company.com',
    role: 'Supervisor Warehouse'
  },
  {
    full_name: 'Cakrajiya Najmudin',
    emp_no: 'EMP-011',
    factory: 'Factory Warehouse',
    line: 'Line Packing',
    phone: '8123456011',
    email: 'cakrajiya.najmudin@company.com',
    role: 'Admin Warehouse'
  },
  {
    full_name: 'Taufik Hidayat',
    emp_no: 'EMP-012',
    factory: 'Factory Assy',
    line: 'Line Assembly Frame',
    phone: '8123456012',
    email: 'taufik.hidayat@company.com',
    role: 'Admin PPIC'
  },
  {
    full_name: 'Ridwan Utama',
    emp_no: 'EMP-013',
    factory: 'Factory Assy',
    line: 'Line Assembly Electrical',
    phone: '8123456013',
    email: 'ridwan.utama@company.com',
    role: 'Staff PPIC'
  },
  {
    full_name: 'Rahmi Wastuti',
    emp_no: 'EMP-014',
    factory: 'Factory Assy',
    line: 'Line Assembly Final',
    phone: '8123456014',
    email: 'rahmi.wastuti@company.com',
    role: 'Supervisor PPIC'
  },
  // Division PURCHASING
  {
    full_name: 'Lukman Mandala',
    emp_no: 'EMP-015',
    factory: null,
    line: null,
    phone: '8123456015',
    email: 'lukman.mandala@company.com',
    role: 'Staff Material'
  },
  {
    full_name: 'Aswani Wahyudin',
    emp_no: 'EMP-016',
    factory: null,
    line: null,
    phone: '8123456016',
    email: 'aswani.wahyudin@company.com',
    role: 'Supervisor Material'
  },
  {
    full_name: 'Prasetyo Nugroho',
    emp_no: 'EMP-018',
    factory: null,
    line: null,
    phone: '8123456018',
    email: 'prasetyo.nugroho@company.com',
    role: 'Admin Material'
  },
  {
    full_name: 'Bahuwirya Simbolon',
    emp_no: 'EMP-017',
    factory: null,
    line: null,
    phone: '8123456017',
    email: 'bahuwirya.simbolon@company.com',
    role: 'Driver'
  }
];

    const users = [];
    const employees = [];
    let userIdCounter = await queryInterface.rawSelect('s_users', { plain: true }, ['max(id)']) || 0;

    // 1. Prepare Users
    for (const d of rawData) {
      const roleId = await getRoleId(d.role);
      // Ensure we have a valid role ID (fallback to null or skip if critical)
      if (roleId) {
        users.push({
          email: d.email,
          password: defaultPassword,
          role_id: roleId,
          active: true,
          ...timestamp
        });
      } else {
        console.warn(`Skipping user ${d.email} due to missing role: ${d.role}`);
      }
    }

    if (users.length > 0) {
      await queryInterface.bulkInsert('s_users', users, { ignoreDuplicates: true });
    }

    // 2. Fetch Users to get IDs
    if (users.length === 0) {
      console.warn('No users to insert, skipping employee creation.');
      return;
    }

    const createdUsers = await queryInterface.sequelize.query(
      `SELECT id, email FROM s_users WHERE email IN (${users.map(u => `'${u.email}'`).join(',')})`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const userMap = {};
    createdUsers.forEach(u => userMap[u.email] = u.id);

    // 3. Prepare Employees
    for (const d of rawData) {
      const userId = userMap[d.email];
      const factoryId = await getFactoryId(d.factory);
      const lineId = await getLineId(d.line);

      if (userId) {
        employees.push({
          user_id: userId,
          employee_number: d.emp_no,
          full_name: d.full_name,
          phone_number: d.phone,
          factory_id: factoryId || null,
          line_id: lineId || null,
          ...timestamp
        });
      }
    }

    if (employees.length > 0) {
      await queryInterface.bulkInsert('s_users_details', employees, { ignoreDuplicates: true });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_users_details', null, {});
    await queryInterface.bulkDelete('s_users', null, {});
  }
};
