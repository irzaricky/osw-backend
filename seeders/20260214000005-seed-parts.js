/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // Ambil UOM ids dari s_uoms untuk dipakai sebagai FK
    const [uomRows] = await queryInterface.sequelize.query(
      `SELECT id, code FROM s_uoms WHERE deleted_at IS NULL;`
    );
    const uomMap = Object.fromEntries(uomRows.map((r) => [r.code, r.id]));

    // Ambil package ids dari s_packages
    const [pkgRows] = await queryInterface.sequelize.query(
      `SELECT id, package_code FROM s_packages WHERE deleted_at IS NULL;`
    );
    const pkgMap = Object.fromEntries(pkgRows.map((r) => [r.package_code, r.id]));

    // Ambil part_category ids dari ref_part_categories
    const [catRows] = await queryInterface.sequelize.query(
      `SELECT id, code FROM ref_part_categories WHERE deleted_at IS NULL;`
    );
    const catMap = Object.fromEntries(catRows.map((r) => [r.code, r.id]));

    const now = new Date();

    // ============================================
    // 1. Products Data
    // ============================================
    const products = [
      { part_number: 'VOBKME2025', part_name: 'VOLT STALLION BLACK GEN 2025', part_type_code: 'PRODUCT', model_name: 'VOLT', model_code: 'VO', generation: '2025', color: 'STALLION BLACK', color_code: 'BKME', uom_code: 'PCS', package_code: 'PKG-STD-L', safety_stock: 20 },
      { part_number: 'VOGRME2025', part_name: 'VOLT ARMOR GREY GEN 2025',      part_type_code: 'PRODUCT', model_name: 'VOLT', model_code: 'VO', generation: '2025', color: 'ARMOR GREY',    color_code: 'GRME', uom_code: 'PCS', package_code: 'PKG-STD-L', safety_stock: 20 },
      { part_number: 'VOWHME2025', part_name: 'VOLT ROYAL WHITE GEN 2025',     part_type_code: 'PRODUCT', model_name: 'VOLT', model_code: 'VO', generation: '2025', color: 'ROYAL WHITE',   color_code: 'WHME', uom_code: 'PCS', package_code: 'PKG-STD-L', safety_stock: 20 },
      { part_number: 'VOBKME2026', part_name: 'VOLT STALLION BLACK GEN 2026', part_type_code: 'PRODUCT', model_name: 'VOLT', model_code: 'VO', generation: '2026', color: 'STALLION BLACK', color_code: 'BKME', uom_code: 'PCS', package_code: 'PKG-STD-L', safety_stock: 20 },
      { part_number: 'VOGRME2026', part_name: 'VOLT ARMOR GREY GEN 2026',      part_type_code: 'PRODUCT', model_name: 'VOLT', model_code: 'VO', generation: '2026', color: 'ARMOR GREY',    color_code: 'GRME', uom_code: 'PCS', package_code: 'PKG-STD-L', safety_stock: 20 },
      { part_number: 'VOWHME2026', part_name: 'VOLT ROYAL WHITE GEN 2026',     part_type_code: 'PRODUCT', model_name: 'VOLT', model_code: 'VO', generation: '2026', color: 'ROYAL WHITE',   color_code: 'WHME', uom_code: 'PCS', package_code: 'PKG-STD-L', safety_stock: 20 },
      { part_number: 'ECBKME2025', part_name: 'ECO STALLION BLACK GEN 2025',  part_type_code: 'PRODUCT', model_name: 'ECO',  model_code: 'EC', generation: '2025', color: 'STALLION BLACK', color_code: 'BKME', uom_code: 'PCS', package_code: 'PKG-STD-M', safety_stock: 20 },
      { part_number: 'ECGRME2025', part_name: 'ECO ARMOR GREY GEN 2025',       part_type_code: 'PRODUCT', model_name: 'ECO',  model_code: 'EC', generation: '2025', color: 'ARMOR GREY',    color_code: 'GRME', uom_code: 'PCS', package_code: 'PKG-STD-M', safety_stock: 20 },
      { part_number: 'ECWHME2025', part_name: 'ECO ROYAL WHITE GEN 2025',      part_type_code: 'PRODUCT', model_name: 'ECO',  model_code: 'EC', generation: '2025', color: 'ROYAL WHITE',   color_code: 'WHME', uom_code: 'PCS', package_code: 'PKG-STD-M', safety_stock: 20 },
      { part_number: 'ECBKME2026', part_name: 'ECO STALLION BLACK GEN 2026',  part_type_code: 'PRODUCT', model_name: 'ECO',  model_code: 'EC', generation: '2026', color: 'STALLION BLACK', color_code: 'BKME', uom_code: 'PCS', package_code: 'PKG-STD-M', safety_stock: 20 },
      { part_number: 'ECGRME2026', part_name: 'ECO ARMOR GREY GEN 2026',       part_type_code: 'PRODUCT', model_name: 'ECO',  model_code: 'EC', generation: '2026', color: 'ARMOR GREY',    color_code: 'GRME', uom_code: 'PCS', package_code: 'PKG-STD-M', safety_stock: 20 },
      { part_number: 'ECWHME2026', part_name: 'ECO ROYAL WHITE GEN 2026',      part_type_code: 'PRODUCT', model_name: 'ECO',  model_code: 'EC', generation: '2026', color: 'ROYAL WHITE',   color_code: 'WHME', uom_code: 'PCS', package_code: 'PKG-STD-M', safety_stock: 20 },
    ];

    // ============================================
    // 2. Parts Data (WIP & RAW)
    // ============================================
    const parts = [
      // --- WIP: Assemblies ---
      { part_number: 'ASSY-WHEEL-F-26',      part_name: 'Front Wheel Assy 26 Inch (Volt)',           part_type_code: 'WIP', part_category_code: 'BIG',    price: 650000,   safety_stock: 10,   lead_time_days: 1,  uom_code: 'PCS', package_code: 'PKG-STD-L'  },
      { part_number: 'ASSY-WHEEL-F-20',      part_name: 'Front Wheel Assy 20 Inch (Eco)',            part_type_code: 'WIP', part_category_code: 'BIG',    price: 450000,   safety_stock: 10,   lead_time_days: 1,  uom_code: 'PCS', package_code: 'PKG-STD-M'  },
      { part_number: 'ASSY-WHEEL-R-MOTOR-26',part_name: 'Rear Motor Wheel Assy 26" 350W (Volt)',    part_type_code: 'WIP', part_category_code: 'BIG',    price: 3500000,  safety_stock: 10,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-STD-L'  },
      { part_number: 'ASSY-WHEEL-R-MOTOR-20',part_name: 'Rear Motor Wheel Assy 20" 250W (Eco)',     part_type_code: 'WIP', part_category_code: 'BIG',    price: 2500000,  safety_stock: 10,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-STD-M'  },
      { part_number: 'ASSY-HANDLEBAR-VC',    part_name: 'Handlebar Set VoltCity',                   part_type_code: 'WIP', part_category_code: 'MEDIUM', price: 250000,   safety_stock: 20,   lead_time_days: 1,  uom_code: 'PCS', package_code: 'PKG-BOX-M'  },
      { part_number: 'ASSY-HUB-F',           part_name: 'Front Hub System Assembly',                part_type_code: 'WIP', part_category_code: 'SMALL',  price: 220000,   safety_stock: 50,   lead_time_days: 1,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'ASSY-MOTOR-HUB-48V',   part_name: 'Hub Motor Listrik 48V (Sub-Assy Volt)',    part_type_code: 'WIP', part_category_code: 'SMALL',  price: 2800000,  safety_stock: 20,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'ASSY-MOTOR-HUB-36V',   part_name: 'Hub Motor Listrik 36V (Sub-Assy Eco)',     part_type_code: 'WIP', part_category_code: 'SMALL',  price: 2000000,  safety_stock: 20,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-BOX-S'  },

      // --- WIP: Parts ---
      { part_number: 'PART-FRAME-VC',        part_name: 'Main Frame VoltCity Unpainted',            part_type_code: 'WIP', part_category_code: 'BIG',    price: 1800000,  safety_stock: 20,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-STD-L'  },
      { part_number: 'PART-FRAME-EF',        part_name: 'Main Frame EcoFold Unpainted',             part_type_code: 'WIP', part_category_code: 'BIG',    price: 1300000,  safety_stock: 20,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-STD-M'  },
      { part_number: 'PART-FORK-26',         part_name: 'Front Suspension Fork 26 Inch (Volt)',     part_type_code: 'WIP', part_category_code: 'BIG',    price: 900000,   safety_stock: 20,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-BOX-L'  },
      { part_number: 'PART-FORK-20',         part_name: 'Front Rigid Fork 20 Inch (Eco)',           part_type_code: 'WIP', part_category_code: 'BIG',    price: 450000,   safety_stock: 20,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-BOX-L'  },
      { part_number: 'PART-BATT-48V',        part_name: 'Lithium Battery Pack 48V 15Ah (Volt)',     part_type_code: 'WIP', part_category_code: 'MEDIUM', price: 4200000,  safety_stock: 20,   lead_time_days: 30, uom_code: 'PCS', package_code: 'PKG-BOX-M'  },
      { part_number: 'PART-BATT-36V',        part_name: 'Lithium Battery Pack 36V 10Ah (Eco)',      part_type_code: 'WIP', part_category_code: 'MEDIUM', price: 2800000,  safety_stock: 20,   lead_time_days: 30, uom_code: 'PCS', package_code: 'PKG-BOX-M'  },
      { part_number: 'PART-CONTROLLER-48V',  part_name: 'Controller Unit 48V (Volt)',               part_type_code: 'WIP', part_category_code: 'SMALL',  price: 750000,   safety_stock: 20,   lead_time_days: 7,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-CONTROLLER-36V',  part_name: 'Controller Unit 36V (Eco)',                part_type_code: 'WIP', part_category_code: 'SMALL',  price: 550000,   safety_stock: 20,   lead_time_days: 7,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-BRAKE-SET',       part_name: 'Mechanical Disc Brake Set (F+R)',          part_type_code: 'WIP', part_category_code: 'SMALL',  price: 350000,   safety_stock: 50,   lead_time_days: 5,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-SADDLE',          part_name: 'Ergonomic Saddle',                         part_type_code: 'WIP', part_category_code: 'MEDIUM', price: 180000,   safety_stock: 50,   lead_time_days: 3,  uom_code: 'PCS', package_code: 'PKG-BOX-M'  },
      { part_number: 'PART-PEDAL-SET',       part_name: 'Pedal & Crank Arm Set',                    part_type_code: 'WIP', part_category_code: 'MEDIUM', price: 320000,   safety_stock: 50,   lead_time_days: 5,  uom_code: 'PCS', package_code: 'PKG-BOX-M'  },
      { part_number: 'PART-CHAIN',           part_name: 'Bicycle Chain',                            part_type_code: 'WIP', part_category_code: 'SMALL',  price: 120000,   safety_stock: 100,  lead_time_days: 3,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-DISPLAY-LCD',     part_name: 'LCD Speedometer & Dashboard Unit',         part_type_code: 'WIP', part_category_code: 'SMALL',  price: 650000,   safety_stock: 50,   lead_time_days: 7,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-THROTTLE',        part_name: 'Hand Throttle Grip',                       part_type_code: 'WIP', part_category_code: 'SMALL',  price: 150000,   safety_stock: 50,   lead_time_days: 3,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-WIRING-HARNESS',  part_name: 'Main Wiring Harness',                      part_type_code: 'WIP', part_category_code: 'SMALL',  price: 280000,   safety_stock: 50,   lead_time_days: 5,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-KICKSTAND',       part_name: 'Side Kickstand',                           part_type_code: 'WIP', part_category_code: 'MEDIUM', price: 90000,    safety_stock: 50,   lead_time_days: 3,  uom_code: 'PCS', package_code: 'PKG-BOX-M'  },
      { part_number: 'PART-GRIP-RUBBER',     part_name: 'Rubber Hand Grip',                         part_type_code: 'WIP', part_category_code: 'SMALL',  price: 45000,    safety_stock: 200,  lead_time_days: 3,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-SEAT-CLAMP',      part_name: 'Seat Post Clamp 31.8mm',                   part_type_code: 'WIP', part_category_code: 'SMALL',  price: 55000,    safety_stock: 50,   lead_time_days: 5,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-STEM',            part_name: 'Handlebar Stem',                           part_type_code: 'WIP', part_category_code: 'SMALL',  price: 140000,   safety_stock: 50,   lead_time_days: 5,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-RD-UNIT',         part_name: 'Rear Derailleur Unit',                     part_type_code: 'WIP', part_category_code: 'SMALL',  price: 350000,   safety_stock: 50,   lead_time_days: 5,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },

      // --- RAW Materials ---
      { part_number: 'PART-TIRE-26',         part_name: 'Tire External 26 Inch',                    part_type_code: 'RAW', part_category_code: 'BIG',    price: 250000,   safety_stock: 100,  lead_time_days: 3,  uom_code: 'PCS', package_code: 'PKG-BOX-L'  },
      { part_number: 'PART-TIRE-20',         part_name: 'Tire External 20 Inch',                    part_type_code: 'RAW', part_category_code: 'BIG',    price: 180000,   safety_stock: 100,  lead_time_days: 3,  uom_code: 'PCS', package_code: 'PKG-BOX-L'  },
      { part_number: 'PART-RIM-26',          part_name: 'Alloy Rim 26 Inch',                        part_type_code: 'RAW', part_category_code: 'BIG',    price: 350000,   safety_stock: 50,   lead_time_days: 7,  uom_code: 'PCS', package_code: 'PKG-BOX-L'  },
      { part_number: 'PART-RIM-20',          part_name: 'Alloy Rim 20 Inch',                        part_type_code: 'RAW', part_category_code: 'BIG',    price: 280000,   safety_stock: 50,   lead_time_days: 7,  uom_code: 'PCS', package_code: 'PKG-BOX-L'  },
      { part_number: 'PART-SPOKE-SS',        part_name: 'Stainless Spoke',                          part_type_code: 'RAW', part_category_code: 'SMALL',  price: 3500,     safety_stock: 1000, lead_time_days: 3,  uom_code: 'PCS',  package_code: 'PKG-BULK-S' },
      { part_number: 'PART-RD-HANGER',       part_name: 'Rear Derailleur Hanger',                   part_type_code: 'RAW', part_category_code: 'SMALL',  price: 65000,    safety_stock: 50,   lead_time_days: 5,  uom_code: 'PCS',  package_code: 'PKG-BULK-S' },
      { part_number: 'PART-SEATPOST',        part_name: 'Seatpost Alloy Tube',                      part_type_code: 'RAW', part_category_code: 'BIG',    price: 160000,   safety_stock: 50,   lead_time_days: 5,  uom_code: 'PCS', package_code: 'PKG-BOX-L'  },
      { part_number: 'PART-HEADSET',         part_name: 'Headset Bearing Set',                      part_type_code: 'RAW', part_category_code: 'SMALL',  price: 130000,   safety_stock: 50,   lead_time_days: 3,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-FREEWHEEL',       part_name: 'Rear Gear Freewheel 7-Speed',              part_type_code: 'RAW', part_category_code: 'SMALL',  price: 210000,   safety_stock: 50,   lead_time_days: 5,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-BATT-CASE',       part_name: 'Battery Plastic Case Enclosure',           part_type_code: 'RAW', part_category_code: 'MEDIUM', price: 300000,   safety_stock: 50,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-BOX-M'  },
      { part_number: 'PART-BMS-48V',         part_name: 'BMS PCB 48V (Volt)',                       part_type_code: 'RAW', part_category_code: 'SMALL',  price: 450000,   safety_stock: 50,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-BMS-36V',         part_name: 'BMS PCB 36V (Eco)',                        part_type_code: 'RAW', part_category_code: 'SMALL',  price: 320000,   safety_stock: 50,   lead_time_days: 14, uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-CELL-18650',      part_name: 'Lithium Cell 18650 2500mAh',               part_type_code: 'RAW', part_category_code: 'SMALL',  price: 55000,    safety_stock: 2000, lead_time_days: 30, uom_code: 'PCS',  package_code: 'PKG-TRAY-50'},
      { part_number: 'PART-BEARING-608',     part_name: 'Ball Bearing 608Z',                        part_type_code: 'RAW', part_category_code: 'BIG',    price: 12000,    safety_stock: 500,  lead_time_days: 2,  uom_code: 'PCS',  package_code: 'PKG-BOX-L'  },
      { part_number: 'PART-AXLE-F',          part_name: 'Front Axle Shaft',                         part_type_code: 'RAW', part_category_code: 'SMALL',  price: 75000,    safety_stock: 200,  lead_time_days: 5,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-AXLE-R',          part_name: 'Rear Axle Shaft',                          part_type_code: 'RAW', part_category_code: 'SMALL',  price: 95000,    safety_stock: 100,  lead_time_days: 5,  uom_code: 'PCS', package_code: 'PKG-BOX-S'  },
      { part_number: 'PART-NUT-M12',         part_name: 'Flange Nut M12',                           part_type_code: 'RAW', part_category_code: 'BIG',    price: 4000,     safety_stock: 500,  lead_time_days: 2,  uom_code: 'PCS',  package_code: 'PKG-BOX-L'  },
    ];

    const allItems = [...products, ...parts];

    for (const item of allItems) {
      const exists = await queryInterface.rawSelect(
        's_parts',
        { where: { part_number: item.part_number } },
        ['id']
      );

      if (!exists) {
        const uom_id = uomMap[item.uom_code] ?? null;
        const package_id = pkgMap[item.package_code] ?? null;

        if (!uom_id) {
          console.warn(`[WARN] UOM code '${item.uom_code}' tidak ditemukan untuk part ${item.part_number}`);
        }

        await queryInterface.bulkInsert('s_parts', [
          {
            part_number:      item.part_number,
            part_name:        item.part_name,
            part_type_code:   item.part_type_code,
            part_category:    item.part_category_code,
            model_name:       item.model_name ?? null,
            model_code:       item.model_code ?? null,
            generation:       item.generation ?? null,
            color:            item.color ?? null,
            color_code:       item.color_code ?? null,
            uom_id:           uom_id,
            package_id:       package_id,
            price:            item.price ?? null,
            safety_stock:     item.safety_stock ?? 0,
            lead_time_days:   item.lead_time_days ?? 0,
            created_at:       now,
            updated_at:       now,
          },
        ]);
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('s_parts', null, {});
  },
};