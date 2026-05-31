import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import BaseModule from '../../class/base.module.js';
import helper from '../../class/helper.class.js';
import { Op } from 'sequelize';

const {
  TNgTicket,
  TNgTicketQuantity,
  TNgTicketQuality,
  TMaterialReceivingItemLabel,
  TMaterialReceivingItem,
  TPartLabels,
  SDefects,
  SParts,
  SMaterialDeliveryOrder,
  SMaterialPurchaseOrder,
  SSuppliers,
  TMaterialDeliveryOrderDetail
} = db;

class WarrantyAndClaimModule extends BaseModule {
  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);

      const { count, rows: ngTickets } = await TNgTicket.findAndCountAll({
        attributes: ['id', 'ng_ticket_number', 'createdAt'],
        include: [
          {
            model: TMaterialReceivingItemLabel,
            as: 'mr_item_label',
            required: false,
            attributes: ['id', 'is_quantity', 'is_quality'],
            include: [
              {
                model: TPartLabels,
                as: 'label',
                required: false,
                attributes: ['id', 'label_number'],
                include: [
                  {
                    model: SParts,
                    as: 'part',
                    required: false,
                    attributes: ['id', 'part_number', 'part_name']
                  }
                ]
              },
              {
                model: TMaterialReceivingItem,
                as: 'material_receiving_item',
                required: false,
                attributes: ['id'],
                include: [
                  {
                    model: TMaterialDeliveryOrderDetail,
                    as: 'mdo_detail',
                    required: false,
                    attributes: ['id'],
                    include: [
                      {
                        model: SMaterialDeliveryOrder,
                        as: 'mdo',
                        required: false,
                        attributes: ['id', 'number'],
                        include: [
                          {
                            model: SMaterialPurchaseOrder,
                            as: 'mpo',
                            required: false,
                            attributes: ['id', 'number', 'supplier_id'],
                            include: [
                              {
                                model: SSuppliers,
                                as: 'supplier',
                                required: false,
                                attributes: ['id', 'name']
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            model: TNgTicketQuantity,
            as: 'quantity',
            required: false,
            attributes: ['expected_qty', 'actual_qty']
          },
          {
            model: TNgTicketQuality,
            as: 'qualities',
            required: false,
            separate: true,
            attributes: ['id', 'image'],
            include: [
              {
                model: SDefects,
                as: 'defect',
                required: false,
                attributes: ['id', 'name']
              }
            ]
          }
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
        distinct: true,
        subQuery: false
      });

      const mappedData = await Promise.all(ngTickets.map( async (item) => {
        const mrItemLabel = item.mr_item_label;
        const mrItem = mrItemLabel?.material_receiving_item;
        const mdoDetail = mrItem?.mdo_detail;
        const mdo = mdoDetail?.mdo;
        const mpo = mdo?.mpo;
        const mpoId = mpo?.id;
        const part = mrItemLabel?.label.part;

        let supplier = null;

        if (mpoId) {
          const mpo = await SMaterialPurchaseOrder.findByPk(
            mpoId,
            {
              attributes: ['id'],
              include: [
                {
                  model: SSuppliers,
                  as: 'supplier',
                  attributes: ['id', 'name'],
                  required: false
                }
              ]
            }
          );

          supplier = mpo?.supplier?.name || null;
        }

        const isQuantityNG = mrItemLabel?.is_quantity === false;
        const isQualityNG = mrItemLabel?.is_quality === false;

        let rejectedInfo = '';
        let defects = [];

        if (isQuantityNG) {
          rejectedInfo = `Qty: Expected ${item.quantity?.expected_qty || 0}, Actual ${item.quantity?.actual_qty || 0}`;
        } else if (isQualityNG) {
          defects = (item.qualities || [])
            .map((q) => ({
              id: q.defect?.id || null,
              defect_name: q.defect?.name || null,
              image: q.image ? `${process.env.SITE_URL}${q.image}` : null
            }));

          const defectsList = (item.qualities || [])
            .map(q => q.defect?.name || 'Unknown')
            .join(', ');

          rejectedInfo = `Defects: ${defectsList}`;
        }

        return {
          id: item.id,
          ng_ticket_number: item.ng_ticket_number,
          label_number: mrItemLabel?.label?.label_number || null,
          category: isQuantityNG ? 'Quantity' : 'Quality',
          part_number: part?.part_number || null,
          part_name: part?.part_name || null,
          supplier,
          rejected_info: rejectedInfo,
          mpo_number: mpo?.number || null,
          mdo_number: mdo?.number || null,
          created_at: item.createdAt,
          defects
        };
      }));

      return {
        status: true,
        data: helper.getPaginationData(mappedData, count, page, limit)
      };
    } catch (error) {
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }
}

export default new WarrantyAndClaimModule();