/** @type {import('sequelize-cli').Migration} */
export default {
    async up(queryInterface, Sequelize) {
      // 1. Fetch Part IDs (for both Products and Parts)
      const parts = await queryInterface.sequelize.query(
        `SELECT id, part_number FROM s_parts`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
  
      const partMap = {};
      parts.forEach(p => partMap[p.part_number] = p.id);
  
      // Helper to get ID
      const getPartId = (code) => partMap[code];
  
      // BOM Data Definition
      const boms = [
        // Level 1 BOMs (Product Parent)
        {
          bom_number: 'BOM - VOBKME2025 - V1',
          parent_part: 'VOBKME2025',
          description: 'VOLT STALLION BLACK GEN 2025',
          status: true,
          status_approval: 'Approved',
          details: [
            { part_number: 'PART-FRAME-VC', qty: 1, type: 'WIP', child_bom: 'BOM - PART-FRAME-VC - V1' },
            { part_number: 'ASSY-WHEEL-F-26', qty: 1, type: 'WIP', child_bom: 'BOM - ASSY-WHEEL-F-26 - V1' },
            { part_number: 'ASSY-WHEEL-R-MOTOR-26', qty: 1, type: 'WIP', child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-26 - V1' },
            { part_number: 'PART-BATT-48V', qty: 1, type: 'WIP', child_bom: 'BOM - PART-BATT-48V - V1' },
            { part_number: 'ASSY-HANDLEBAR-VC', qty: 1, type: 'WIP', child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1' },
            { part_number: 'PART-CONTROLLER-48V', qty: 1, type: 'Raw material' },
            { part_number: 'PART-BRAKE-SET', qty: 1, type: 'Raw material' },
            { part_number: 'PART-SADDLE', qty: 1, type: 'Raw material' },
            { part_number: 'PART-PEDAL-SET', qty: 1, type: 'Raw material' },
            { part_number: 'PART-CHAIN', qty: 1, type: 'Raw material' },
            { part_number: 'PART-DISPLAY-LCD', qty: 1, type: 'Raw material' },
            { part_number: 'PART-THROTTLE', qty: 1, type: 'Raw material' },
            { part_number: 'PART-WIRING-HARNESS', qty: 1, type: 'Raw material' },
            { part_number: 'PART-KICKSTAND', qty: 1, type: 'Raw material' },
            { part_number: 'PART-FORK-26', qty: 1, type: 'Raw material' }
          ]
        },
        {
          bom_number: 'BOM - ECBKME2025V1',
          parent_part: 'ECBKME2025',
          description: 'ECO STALLION BLACK GEN 2025',
          status: true,
          status_approval: 'Approved',
          details: [
            { part_number: 'PART-FRAME-EF', qty: 1, type: 'WIP', child_bom: 'BOM - PART-FRAME-EF - V1' },
            { part_number: 'ASSY-WHEEL-F-20', qty: 1, type: 'WIP', child_bom: 'BOM - ASSY-WHEEL-F-20 - V1' },
            { part_number: 'ASSY-WHEEL-R-MOTOR-20', qty: 1, type: 'WIP', child_bom: 'BOM - ASSY-WHEEL-R-MOTOR-20 - V1' },
            { part_number: 'PART-BATT-36V', qty: 1, type: 'WIP', child_bom: 'BOM - PART-BATT-36V - V1' },
            { part_number: 'ASSY-HANDLEBAR-VC', qty: 1, type: 'WIP', child_bom: 'BOM - ASSY-HANDLEBAR-VC - V1' },
            { part_number: 'PART-CONTROLLER-36V', qty: 1, type: 'Raw material' },
            { part_number: 'PART-BRAKE-SET', qty: 1, type: 'Raw material' },
            { part_number: 'PART-SADDLE', qty: 1, type: 'Raw material' },
            { part_number: 'PART-PEDAL-SET', qty: 1, type: 'Raw material' },
            { part_number: 'PART-CHAIN', qty: 1, type: 'Raw material' },
            { part_number: 'PART-DISPLAY-LCD', qty: 1, type: 'Raw material' },
            { part_number: 'PART-THROTTLE', qty: 1, type: 'Raw material' },
            { part_number: 'PART-WIRING-HARNESS', qty: 1, type: 'Raw material' },
            { part_number: 'PART-KICKSTAND', qty: 1, type: 'Raw material' },
            { part_number: 'PART-FORK-20', qty: 1, type: 'Raw material' }
          ]
        },
        {
          bom_number: 'BOM - PART-FRAME-VC - V1',
          parent_part: 'PART-FRAME-VC',
          status: true,
          status_approval: 'Approved',
          details: [
            { part_number: 'PART-SEAT-CLAMP', qty: 1 },
            { part_number: 'PART-SEATPOST', qty: 1 },
            { part_number: 'PART-RD-HANGER', qty: 1 },
            { part_number: 'PART-HEADSET', qty: 1 },
            { part_number: 'PART-RD-UNIT', qty: 1 }
          ]
        },
        {
          bom_number: 'BOM - ASSY-WHEEL-F-26 - V1',
          parent_part: 'ASSY-WHEEL-F-26',
          status: true,
          status_approval: 'Approved',
          details: [
            { part_number: 'ASSY-HUB-F', qty: 1, child_bom: 'BOM - ASSY-HUB-FV1' },
            { part_number: 'PART-TIRE-26', qty: 1 },
            { part_number: 'PART-RIM-26', qty: 1 },
            { part_number: 'PART-SPOKE-SS', qty: 36 }
          ]
        },
        {
            bom_number: 'BOM - ASSY-WHEEL-R-MOTOR-26 - V1',
            parent_part: 'ASSY-WHEEL-R-MOTOR-26',
            status: true,
            status_approval: 'Approved',
            details: [
              { part_number: 'ASSY-MOTOR-HUB-48V', qty: 1, child_bom: 'BOM - ASSY-MOTOR-HUB-48V - V1' },
              { part_number: 'PART-TIRE-26', qty: 1 },
              { part_number: 'PART-RIM-26', qty: 1 },
              { part_number: 'PART-SPOKE-SS', qty: 36 },
              { part_number: 'PART-FREEWHEEL', qty: 1 }
            ]
        },
        {
            bom_number: 'BOM - PART-BATT-48V - V1',
            parent_part: 'PART-BATT-48V',
            status: true,
            status_approval: 'Approved',
            details: [
                { part_number: 'PART-CELL-18650', qty: 52 },
                { part_number: 'PART-BMS-48V', qty: 1 },
                { part_number: 'PART-BATT-CASE', qty: 1 }
            ]
        },
        {
            bom_number: 'BOM - ASSY-HANDLEBAR-VC - V1',
            parent_part: 'ASSY-HANDLEBAR-VC',
            status: true,
            status_approval: 'Approved',
            details: [
                { part_number: 'PART-STEM', qty: 1 },
                { part_number: 'PART-GRIP-RUBBER', qty: 2 }
            ]
        },
        {
            bom_number: 'BOM - ASSY-HUB-FV1',
            parent_part: 'ASSY-HUB-F',
            status: true,
            status_approval: 'Approved',
            details: [
                { part_number: 'PART-BEARING-608', qty: 2 },
                { part_number: 'PART-AXLE-F', qty: 1 },
                { part_number: 'PART-NUT-M12', qty: 2 }
            ]
        },
        {
            bom_number: 'BOM - ASSY-MOTOR-HUB-48V - V1',
            parent_part: 'ASSY-MOTOR-HUB-48V',
            status: true,
            status_approval: 'Approved',
            details: [
                { part_number: 'PART-BEARING-608', qty: 2 },
                { part_number: 'PART-AXLE-R', qty: 1 },
                { part_number: 'PART-NUT-M12', qty: 2 }
            ]
        },
        {
            bom_number: 'BOM - PART-FRAME-EF - V1',
            parent_part: 'PART-FRAME-EF',
            status: true,
            status_approval: 'Approved',
            details: [
                { part_number: 'PART-SEAT-CLAMP', qty: 1 },
                { part_number: 'PART-SEATPOST', qty: 1 },
                { part_number: 'PART-RD-HANGER', qty: 1 },
                { part_number: 'PART-HEADSET', qty: 1 },
                { part_number: 'PART-RD-UNIT', qty: 1 }
            ]
        },
        {
            bom_number: 'BOM - ASSY-WHEEL-F-20 - V1',
            parent_part: 'ASSY-WHEEL-F-20',
            status: true,
            status_approval: 'Approved',
            details: [
                { part_number: 'ASSY-HUB-F', qty: 1, child_bom: 'BOM - ASSY-HUB-FV1' },
                { part_number: 'PART-TIRE-20', qty: 1 },
                { part_number: 'PART-RIM-20', qty: 1 },
                { part_number: 'PART-SPOKE-SS', qty: 28 }
            ]
        },
        {
            bom_number: 'BOM - ASSY-WHEEL-R-MOTOR-20 - V1',
            parent_part: 'ASSY-WHEEL-R-MOTOR-20',
            status: true,
            status_approval: 'Approved',
            details: [
                { part_number: 'ASSY-MOTOR-HUB-36V', qty: 1, child_bom: 'BOM - ASSY-MOTOR-HUB-36V  - V1' },
                { part_number: 'PART-TIRE-20', qty: 1 },
                { part_number: 'PART-RIM-20', qty: 1 },
                { part_number: 'PART-SPOKE-SS', qty: 28 },
                { part_number: 'PART-FREEWHEEL', qty: 1 }
            ]
        },
        {
            bom_number: 'BOM - PART-BATT-36V - V1',
            parent_part: 'PART-BATT-36V',
            status: true,
            status_approval: 'Approved',
            details: [
                { part_number: 'PART-CELL-18650', qty: 40 },
                { part_number: 'PART-BMS-36V', qty: 1 },
                { part_number: 'PART-BATT-CASE', qty: 1 }
            ]
        },
        {
            bom_number: 'BOM - ASSY-MOTOR-HUB-36V  - V1',
            parent_part: 'ASSY-MOTOR-HUB-36V', 
            status: true,
            status_approval: 'Approved',
            details: [
                { part_number: 'PART-BEARING-608', qty: 2 },
                { part_number: 'PART-AXLE-R', qty: 1 },
                { part_number: 'PART-NUT-M12', qty: 2 }
            ]
        }
      ];
  
      // Insert BOM Headers and Details
      for (const bomData of boms) {
        // 1. Check if BOM Header Exists
        const existingBom = await queryInterface.rawSelect('s_boms', {
          where: { bom_number: bomData.bom_number },
        }, ['id']);
  
        let bomId = existingBom;
  
        if (!existingBom) {
          const parentPartId = getPartId(bomData.parent_part);
  
          // Insert Header
          const [id] = await queryInterface.bulkInsert('s_boms', [{
            bom_number: bomData.bom_number,
            description: bomData.description || null,
            parent_part_id: parentPartId,
            status: bomData.status,
            status_approval: bomData.status_approval,
            created_at: new Date(),
            updated_at: new Date()
          }]);
          
          const inserted = await queryInterface.rawSelect('s_boms', {
             where: { bom_number: bomData.bom_number },
          }, ['id']);
          bomId = inserted;
        }
  
        // 2. Insert Details
        if (bomId && bomData.details && bomData.details.length > 0) {
           for (const detail of bomData.details) {
              const partId = getPartId(detail.part_number);
              if (!partId) {
                  // console.warn(`Part not found for seed: ${detail.part_number}`);
                  continue;
              }
  
              const existingDetail = await queryInterface.rawSelect('s_bom_details', {
                 where: { bom_id: bomId, part_id: partId }
              }, ['id']);
  
              if (!existingDetail) {
                 await queryInterface.bulkInsert('s_bom_details', [{
                    bom_id: bomId,
                    part_id: partId,
                    qty_required: detail.qty,
                    child_bom_number: detail.child_bom || null,
                    type: detail.type || null,
                    created_at: new Date(),
                    updated_at: new Date()
                 }]);
              }
           }
        }
      }
    },
  
    async down(queryInterface, Sequelize) {
      await queryInterface.bulkDelete('s_bom_details', null, {});
      await queryInterface.bulkDelete('s_boms', null, {});
    }
  };
