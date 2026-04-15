export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    // 1. Seed Work Order Storing Type
    const type = [
      { id: 1, name: 'Raw Materials', ...timestamp },
      { id: 2, name: 'WIP', ...timestamp },
      { id: 3, name: 'Finish Good', ...timestamp }
    ];
    await queryInterface.bulkInsert('ref_work_order_storing_type', type, { ignoreDuplicates: true });

    // 2. Seed Work Order Storing Status
    const status = [
      { id: 1, name: 'Draft', ...timestamp },
      { id: 2, name: 'Submitted', ...timestamp },
      { id: 3, name: 'In Progress', ...timestamp },
      { id: 4, name: 'Completed', ...timestamp }
    ];
    await queryInterface.bulkInsert('ref_work_order_storing_status', status, { ignoreDuplicates: true });

    // 3. Seed Work Order Storing
    const workOrders = [
      { id: 1, wo_number: 'WO-F-260416-001', wo_category: 'Placement', wo_date: new Date(), wo_type_id: 3, warehouse_area_id: 9, wo_status_id: 2, created_by: 1, ...timestamp },
      { id: 2, wo_number: 'WO-W-260416-001', wo_category: 'Placement', wo_date: new Date(), wo_type_id: 2, warehouse_area_id: 5, wo_status_id: 2, created_by: 1, ...timestamp },
      { id: 3, wo_number: 'WO-M-260416-001', wo_category: 'Placement', wo_date: new Date(), wo_type_id: 1, warehouse_area_id: 1, wo_status_id: 2, created_by: 1, ...timestamp }
    ];
    await queryInterface.bulkInsert('t_work_order_storing', workOrders, { ignoreDuplicates: true });

    // 4. Seed Work Order Storing Items
    const workOrderItems = [
      { id: 1, wo_id: 1, part_id: 1, total_kanban: 2, ...timestamp },
      { id: 2, wo_id: 1, part_id: 2, total_kanban: 1, ...timestamp },
      { id: 3, wo_id: 2, part_id: 13, total_kanban: 3, ...timestamp },
      { id: 4, wo_id: 3, part_id: 41, total_kanban: 2, ...timestamp }
    ];
    await queryInterface.bulkInsert('t_work_order_storing_item', workOrderItems, { ignoreDuplicates: true });

    // 5. Seed Part Labels
    const partLabels = [
      { id: 1, label_number: 'WO-VOBKME2025-260416-000001', part_id: 1, ...timestamp },
      { id: 2, label_number: 'WO-VOBKME2025-260416-000002', part_id: 1, ...timestamp },
      { id: 3, label_number: 'WO-VOGRME2025-260416-000003', part_id: 2, ...timestamp },
      { id: 4, label_number: 'WO-ASSY-WHEEL-F-26-260416-000001', part_id: 13, ...timestamp },
      { id: 5, label_number: 'WO-ASSY-WHEEL-F-26-260416-000002', part_id: 13, ...timestamp },
      { id: 6, label_number: 'WO-ASSY-WHEEL-F-26-260416-000003', part_id: 13, ...timestamp },
      { id: 7, label_number: 'WO-PART-TIRE-26-260416-000001', part_id: 41, ...timestamp },
      { id: 8, label_number: 'WO-PART-TIRE-26-260416-000002', part_id: 41, ...timestamp }
    ];
    await queryInterface.bulkInsert('t_part_labels', partLabels, { ignoreDuplicates: true });

    // 6. Seed Work Order Storing Item Labels
    const itemLabels = [
      { id: 1, wo_item_id: 1, label_id: 1, ...timestamp },
      { id: 2, wo_item_id: 1, label_id: 2, ...timestamp },
      { id: 3, wo_item_id: 2, label_id: 3, ...timestamp },
      { id: 4, wo_item_id: 3, label_id: 4, ...timestamp },
      { id: 5, wo_item_id: 3, label_id: 5, ...timestamp },
      { id: 6, wo_item_id: 3, label_id: 6, ...timestamp },
      { id: 7, wo_item_id: 4, label_id: 7, ...timestamp },
      { id: 8, wo_item_id: 4, label_id: 8, ...timestamp }
    ];
    await queryInterface.bulkInsert('t_work_order_storing_item_label', itemLabels, { ignoreDuplicates: true });

    // Reset sequences for Postgres
    if (queryInterface.sequelize.options.dialect === 'postgres') {
        await queryInterface.sequelize.query("SELECT setval('ref_work_order_storing_type_id_seq', (SELECT MAX(id) FROM ref_work_order_storing_type));");
        await queryInterface.sequelize.query("SELECT setval('ref_work_order_storing_status_id_seq', (SELECT MAX(id) FROM ref_work_order_storing_status));");
        await queryInterface.sequelize.query("SELECT setval('t_work_order_storing_id_seq', (SELECT MAX(id) FROM t_work_order_storing));");
        await queryInterface.sequelize.query("SELECT setval('t_work_order_storing_item_id_seq', (SELECT MAX(id) FROM t_work_order_storing_item));");
        await queryInterface.sequelize.query("SELECT setval('t_part_labels_id_seq', (SELECT MAX(id) FROM t_part_labels));");
        await queryInterface.sequelize.query("SELECT setval('t_work_order_storing_item_label_id_seq', (SELECT MAX(id) FROM t_work_order_storing_item_label));");
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('t_work_order_storing_item_label', null, {});
    await queryInterface.bulkDelete('t_part_labels', null, {});
    await queryInterface.bulkDelete('t_work_order_storing_item', null, {});
    await queryInterface.bulkDelete('t_work_order_storing', null, {});
    await queryInterface.bulkDelete('ref_work_order_storing_status', null, {});
    await queryInterface.bulkDelete('ref_work_order_storing_type', null, {});
  }
};