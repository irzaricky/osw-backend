export default {
  async up(queryInterface, Sequelize) {
    const timestamp = { created_at: new Date(), updated_at: new Date() };

    // Ambil semua bin yang dibutuhkan
    const bins = await queryInterface.sequelize.query(
      `SELECT id, bin_code FROM s_warehouse_bins
       WHERE bin_code IN (
         'AREA-VOLT-R1C1',
         'AREA-VOLT-R2C1',
         'AREA-ECO-R1C1',
         'WIP-FRAME-R1C1',
         'WIP-WHEEL-R1C1',
         'WIP-ELEC-R1C1',
         'WIP-GENERAL-R1C1',
         'AREA-FRAME-R1C1',
         'AREA-TIRE-R1C1',
         'AREA-SMALL-R1C1',
         'AREA-ELEC-R1C1'
       )`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const binMap = {};
    bins.forEach(b => binMap[b.bin_code] = b.id);

    // Ambil label_number terakhir untuk generate nomor baru
    const lastLabel = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(id), 0) AS max_id FROM t_part_labels`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    let labelId  = (lastLabel[0]?.max_id ?? 0) + 1;

    const lastItemLabel = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(id), 0) AS max_id FROM t_work_order_storing_item_label`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    let itemLabelId = (lastItemLabel[0]?.max_id ?? 0) + 1;

    // Helper: tentukan bin berdasarkan part
    function resolveBin(partNumber, partTypeCode, partCategory) {
      // PRODUCT
      if (partTypeCode === 'PRODUCT') {
        if (partNumber.startsWith('VO')) return 'AREA-VOLT-R1C1'
        if (partNumber.startsWith('EC')) return 'AREA-ECO-R1C1'
        return 'AREA-VOLT-R1C1'
      }

      // WIP
      if (partTypeCode === 'WIP') {
        if (partCategory === 'BIG') {
          // Frame → WIP-FRAME, Wheel/Motor → WIP-WHEEL
          if (partNumber.includes('FRAME') || partNumber.includes('FORK')) return 'WIP-FRAME-R1C1'
          return 'WIP-WHEEL-R1C1'
        }
        // MEDIUM/SMALL WIP → electrical or general
        if (partNumber.includes('BATT') || partNumber.includes('BMS') ||
            partNumber.includes('CONTROLLER') || partNumber.includes('WIRING') ||
            partNumber.includes('MOTOR') || partNumber.includes('ELEC')) {
          return 'WIP-ELEC-R1C1'
        }
        return 'WIP-GENERAL-R1C1'
      }

      // RAW
      if (partTypeCode === 'RAW') {
        if (partCategory === 'BIG') {
          if (partNumber.includes('TIRE') || partNumber.includes('RIM')) return 'AREA-TIRE-R1C1'
          return 'AREA-FRAME-R1C1'
        }
        // SMALL RAW
        if (partNumber.includes('BMS') || partNumber.includes('CELL') ||
            partNumber.includes('BATT') || partNumber.includes('CONNECTOR') ||
            partNumber.includes('SENSOR') || partNumber.includes('CHARGE') ||
            partNumber.includes('FUSE')) {
          return 'AREA-ELEC-R1C1'
        }
        return 'AREA-SMALL-R1C1'
      }

      return 'AREA-SMALL-R1C1'
    }

    // Data semua part dari DB
    const parts = await queryInterface.sequelize.query(
      `SELECT id, part_number, part_type_code, part_category FROM s_parts WHERE deleted_at IS NULL`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const dateStr = new Date().toISOString().slice(2,10).replace(/-/g,'');

    const newLabels    = [];
    const newItemLabels = [];
    const newStocks    = [];

    // Ambil wo_item_id yang ada per part dari seeder sebelumnya
    // Kita buat WO Storing Item baru untuk seeder ini — gunakan wo_id yang sudah ada
    // Mapping: RAW → wo_id 3 (WO-M), WIP → wo_id 2 (WO-W), PRODUCT → wo_id 1 (WO-F)
    const woMap = { PRODUCT: 1, WIP: 2, RAW: 3 };

    // Ambil wo_item per (wo_id, part_id) yang sudah ada
    const existingItems = await queryInterface.sequelize.query(
      `SELECT id, wo_id, part_id FROM t_work_order_storing_item`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const itemMap = {};
    existingItems.forEach(i => { itemMap[`${i.wo_id}_${i.part_id}`] = i.id; });

    const lastItem = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(id), 0) AS max_id FROM t_work_order_storing_item`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    let woItemId = (lastItem[0]?.max_id ?? 0) + 1;

    const newWoItems = [];

    for (const part of parts) {
      const woId    = woMap[part.part_type_code] ?? 3;
      const itemKey = `${woId}_${part.id}`;
      let   currentWoItemId;

      if (itemMap[itemKey]) {
        currentWoItemId = itemMap[itemKey];
      } else {
        currentWoItemId = woItemId++;
        newWoItems.push({
          id:           currentWoItemId,
          wo_id:        woId,
          part_id:      part.id,
          total_kanban: 1,
          ...timestamp,
        });
        itemMap[itemKey] = currentWoItemId;
      }

      const binCode    = resolveBin(part.part_number, part.part_type_code, part.part_category);
      const binId      = binMap[binCode];
      if (!binId) continue; // bin belum ada, skip

      const currentLabelId = labelId++;
      const labelNumber = `STK-${part.part_number}-${dateStr}-${String(currentLabelId).padStart(6, '0')}`;

      newLabels.push({
        id:           currentLabelId,
        label_number: labelNumber,
        part_id:      part.id,
        ...timestamp,
      });

      const currentItemLabelId = itemLabelId++;
      newItemLabels.push({
        id:         currentItemLabelId,
        wo_item_id: currentWoItemId,
        label_id:   currentLabelId,
        ...timestamp,
      });

      newStocks.push({
        wo_item_label_id: currentItemLabelId,
        bin_id:           binId,
        ...timestamp,
      });
    }

    // Insert berurutan karena ada foreign key
    if (newWoItems.length)    await queryInterface.bulkInsert('t_work_order_storing_item',       newWoItems,    { ignoreDuplicates: true });
    if (newLabels.length)     await queryInterface.bulkInsert('t_part_labels',                   newLabels,     { ignoreDuplicates: true });
    if (newItemLabels.length) await queryInterface.bulkInsert('t_work_order_storing_item_label', newItemLabels, { ignoreDuplicates: true });
    if (newStocks.length)     await queryInterface.bulkInsert('t_warehouse_stock',               newStocks,     { ignoreDuplicates: true });

    // Insert t_warehouse_stock_log untuk semua stock STK-
    const insertedStocks = await queryInterface.sequelize.query(
      `SELECT
        ws.id          AS wh_stock_id,
        ws.bin_id,
        ws.wo_item_label_id,
        wil.id         AS item_label_id,
        pl.part_id,
        p.safety_stock
      FROM t_warehouse_stock ws
      JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
      JOIN t_part_labels pl                    ON pl.id  = wil.label_id
      JOIN s_parts p                           ON p.id   = pl.part_id
      WHERE pl.label_number LIKE 'STK-%'`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const stockLogs = insertedStocks.map(s => ({
      wh_stock_id:      s.wh_stock_id,
      is_placement:     true,
      qty_per_kanban:   Math.max(s.safety_stock ?? 50, 50), // minimal 50 agar cukup untuk WO
      part_id:          s.part_id,
      bin_id:           s.bin_id,
      wo_item_label_id: s.wo_item_label_id,
      label_id:         s.item_label_id,
      ...timestamp,
    }));

    if (stockLogs.length) {
      await queryInterface.bulkInsert('t_warehouse_stock_log', stockLogs, { ignoreDuplicates: true });
    }

    // Reset sequence
    if (queryInterface.sequelize.options.dialect === 'postgres') {
      await queryInterface.sequelize.query(
        "SELECT setval('t_warehouse_stock_log_id_seq', (SELECT MAX(id) FROM t_warehouse_stock_log));"
      );
    }

    // Reset sequences
    if (queryInterface.sequelize.options.dialect === 'postgres') {
      await queryInterface.sequelize.query("SELECT setval('t_work_order_storing_item_id_seq',       (SELECT MAX(id) FROM t_work_order_storing_item));");
      await queryInterface.sequelize.query("SELECT setval('t_part_labels_id_seq',                   (SELECT MAX(id) FROM t_part_labels));");
      await queryInterface.sequelize.query("SELECT setval('t_work_order_storing_item_label_id_seq', (SELECT MAX(id) FROM t_work_order_storing_item_label));");
      await queryInterface.sequelize.query("SELECT setval('t_warehouse_stock_id_seq',               (SELECT MAX(id) FROM t_warehouse_stock));");
    }
  },

  async down(queryInterface, Sequelize) {
    // Hapus stock yang di-seed oleh file ini (label_number prefix STK-)
    const labels = await queryInterface.sequelize.query(
      `SELECT id FROM t_part_labels WHERE label_number LIKE 'STK-%'`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const labelIds = labels.map(l => l.id);

    if (labelIds.length) {
      const itemLabels = await queryInterface.sequelize.query(
        `SELECT id FROM t_work_order_storing_item_label WHERE label_id IN (${labelIds.join(',')})`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      const itemLabelIds = itemLabels.map(il => il.id);

      if (itemLabelIds.length) {
        await queryInterface.bulkDelete('t_warehouse_stock', { wo_item_label_id: itemLabelIds }, {});
        await queryInterface.bulkDelete('t_work_order_storing_item_label', { id: itemLabelIds }, {});
      }
      await queryInterface.bulkDelete('t_part_labels', { id: labelIds }, {});
    }

    await queryInterface.bulkDelete('t_warehouse_stock_log', {
      wh_stock_id: { [Sequelize.Op.in]: 
        queryInterface.sequelize.literal(
          `(SELECT ws.id FROM t_warehouse_stock ws
            JOIN t_work_order_storing_item_label wil ON wil.id = ws.wo_item_label_id
            JOIN t_part_labels pl ON pl.id = wil.label_id
            WHERE pl.label_number LIKE 'STK-%')`
        )
      }
    }, {});
  }
};