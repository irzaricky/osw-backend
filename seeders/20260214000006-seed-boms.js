/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // =====================================================
    // GET MASTER DATA
    // =====================================================

    // Parts
    const parts = await queryInterface.sequelize.query(
      `
      SELECT id, part_number
      FROM s_parts
      WHERE deleted_at IS NULL
      `,
      {
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    const partMap = {};
    parts.forEach((p) => {
      partMap[p.part_number] = p.id;
    });

    const getPartId = (code) => partMap[code] || null;

    // UOM
    const uoms = await queryInterface.sequelize.query(
      `
      SELECT id, code
      FROM s_uoms
      WHERE deleted_at IS NULL
      `,
      {
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    const uomMap = {};
    uoms.forEach((u) => {
      uomMap[u.code] = u.id;
    });

    // Document Status
    const docStatuses = await queryInterface.sequelize.query(
      `
      SELECT id, code
      FROM ref_bom_document_statuses
      WHERE deleted_at IS NULL
      `,
      {
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    const docStatusMap = {};
    docStatuses.forEach((s) => {
      docStatusMap[s.code] = s.id;
    });

    // Activation Status
    const activationStatuses = await queryInterface.sequelize.query(
      `
      SELECT id, code
      FROM ref_bom_activation_statuses
      WHERE deleted_at IS NULL
      `,
      {
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    const activationStatusMap = {};
    activationStatuses.forEach((s) => {
      activationStatusMap[s.code] = s.id;
    });

    // Default references
    const pcsUomId = uomMap['PCS'] || null;
    const approvedDocStatusId = docStatusMap['APPROVED'] || null;
    const activeStatusId = activationStatusMap['ACTIVE'] || null;

    // =====================================================
    // BOM DATA
    // =====================================================

    const boms = [
      {
        bom_number: 'BOM - VOBKME2025 - V1',
        parent_part: 'VOBKME2025',
        description: 'VOLT STALLION BLACK GEN 2025',
        notes: 'Main BOM for Volt Stallion Black Gen 2025',
        bom_version: 1,
        details: [
          {
            part_number: 'PART-FRAME-VC',
            qty: 1,
            type: 'WIP',
            child_bom: 'BOM - PART-FRAME-VC - V1',
            level: 1,
            sequence: 1,
          },
          {
            part_number: 'ASSY-WHEEL-F-26',
            qty: 1,
            type: 'WIP',
            child_bom: 'BOM - ASSY-WHEEL-F-26 - V1',
            level: 1,
            sequence: 2,
          },
          {
            part_number: 'PART-CONTROLLER-48V',
            qty: 1,
            type: 'RAW_MATERIAL',
            level: 1,
            sequence: 3,
          },
          {
            part_number: 'PART-BRAKE-SET',
            qty: 1,
            type: 'RAW_MATERIAL',
            level: 1,
            sequence: 4,
          },
        ],
      },

      {
        bom_number: 'BOM - PART-FRAME-VC - V1',
        parent_part: 'PART-FRAME-VC',
        description: 'Frame VC Assembly BOM',
        notes: 'Sub BOM for frame assembly',
        bom_version: 1,
        details: [
          {
            part_number: 'PART-SEAT-CLAMP',
            qty: 1,
            type: 'RAW_MATERIAL',
            level: 2,
            sequence: 1,
          },
          {
            part_number: 'PART-SEATPOST',
            qty: 1,
            type: 'RAW_MATERIAL',
            level: 2,
            sequence: 2,
          },
          {
            part_number: 'PART-RD-HANGER',
            qty: 1,
            type: 'RAW_MATERIAL',
            level: 2,
            sequence: 3,
          },
        ],
      },

      {
        bom_number: 'BOM - ASSY-WHEEL-F-26 - V1',
        parent_part: 'ASSY-WHEEL-F-26',
        description: 'Front Wheel 26 Assembly BOM',
        notes: 'Sub BOM for front wheel',
        bom_version: 1,
        details: [
          {
            part_number: 'ASSY-HUB-F',
            qty: 1,
            type: 'WIP',
            child_bom: 'BOM - ASSY-HUB-FV1',
            level: 2,
            sequence: 1,
          },
          {
            part_number: 'PART-TIRE-26',
            qty: 1,
            type: 'RAW_MATERIAL',
            level: 2,
            sequence: 2,
          },
          {
            part_number: 'PART-RIM-26',
            qty: 1,
            type: 'RAW_MATERIAL',
            level: 2,
            sequence: 3,
          },
          {
            part_number: 'PART-SPOKE-SS',
            qty: 36,
            type: 'RAW_MATERIAL',
            level: 2,
            sequence: 4,
          },
        ],
      },

      {
        bom_number: 'BOM - ASSY-HUB-FV1',
        parent_part: 'ASSY-HUB-F',
        description: 'Front Hub Assembly BOM',
        notes: 'Sub BOM for hub assembly',
        bom_version: 1,
        details: [
          {
            part_number: 'PART-BEARING-608',
            qty: 2,
            type: 'RAW_MATERIAL',
            level: 3,
            sequence: 1,
          },
          {
            part_number: 'PART-AXLE-F',
            qty: 1,
            type: 'RAW_MATERIAL',
            level: 3,
            sequence: 2,
          },
          {
            part_number: 'PART-NUT-M12',
            qty: 2,
            type: 'RAW_MATERIAL',
            level: 3,
            sequence: 3,
          },
        ],
      },
    ];

    // =====================================================
    // PASS 1 - INSERT BOM HEADERS
    // =====================================================

    const bomIdMap = {};

    for (const bomData of boms) {
      // Check existing BOM
      const existingBomId = await queryInterface.rawSelect(
        's_boms',
        {
          where: {
            bom_number: bomData.bom_number,
            deleted_at: null,
          },
        },
        ['id']
      );

      let bomId = existingBomId;

      if (!existingBomId) {
        const parentPartId = getPartId(bomData.parent_part);

        if (!parentPartId) {
          console.warn(
            `[WARN] Parent part not found: ${bomData.parent_part}`
          );
          continue;
        }

        await queryInterface.bulkInsert('s_boms', [
          {
            bom_number: bomData.bom_number,
            description: bomData.description || null,
            parent_part_id: parentPartId,

            notes: bomData.notes || null,
            bom_version: bomData.bom_version || 1,

            uom_id: pcsUomId,
            doc_status_id: approvedDocStatusId,
            activation_status_id: activeStatusId,

            reject_reason: null,

            created_by: null,
            approved_by: null,

            approved_at: now,
            activated_at: now,

            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        ]);

        bomId = await queryInterface.rawSelect(
          's_boms',
          {
            where: {
              bom_number: bomData.bom_number,
              deleted_at: null,
            },
          },
          ['id']
        );
      }

      if (bomId) {
        bomIdMap[bomData.bom_number] = bomId;
      }
    }

    // =====================================================
    // PASS 2 - INSERT BOM DETAILS
    // =====================================================

    for (const bomData of boms) {
      const bomId = bomIdMap[bomData.bom_number];

      if (!bomId) continue;

      if (!bomData.details?.length) continue;

      for (const detail of bomData.details) {
        const partId = getPartId(detail.part_number);

        if (!partId) {
          console.warn(
            `[WARN] Part not found: ${detail.part_number}`
          );
          continue;
        }

        // lookup child bom id
        let childBomId = null;

        if (detail.child_bom) {
          childBomId = bomIdMap[detail.child_bom] || null;

          if (!childBomId) {
            console.warn(
              `[WARN] Child BOM not found: ${detail.child_bom}`
            );
          }
        }

        // Check existing detail
        const existingDetail = await queryInterface.rawSelect(
          's_bom_details',
          {
            where: {
              bom_id: bomId,
              part_id: partId,
              deleted_at: null,
            },
          },
          ['id']
        );

        if (!existingDetail) {
          await queryInterface.bulkInsert('s_bom_details', [
            {
              bom_id: bomId,
              part_id: partId,

              qty_required: detail.qty || 1,

              level: detail.level || 1,
              sequence: detail.sequence || 0,

              type: detail.type || null,

              child_bom_id: childBomId,

              uom_id: pcsUomId,

              scrap_percentage: detail.scrap_percentage || 0,

              notes: detail.notes || null,

              created_at: now,
              updated_at: now,
              deleted_at: null,
            },
          ]);
        }
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_bom_details', null, {});
    await queryInterface.bulkDelete('s_boms', null, {});
  },
};