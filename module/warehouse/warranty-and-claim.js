import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import BaseModule from '../../class/base.module.js';
import helper from '../../class/helper.class.js';
import { Op, QueryTypes } from 'sequelize';

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
      const { category, part, supplier, search } = params;
      const { limit, page, offset } = helper.getPagination(params);

      const searchValue = search ? `%${search}%` : null;
      const where = {};
      if (searchValue) {
        where[Op.or] = [
          { ng_ticket_number: { [Op.like]: searchValue } },
          { '$mr_item_label.label.label_number$': { [Op.like]: searchValue } }
        ];
      }

      const mrItemLabelWhere = {};
      if (category) {
        const normalizedCategory = category.toString().toLowerCase();
        if (normalizedCategory === 'quantity') {
          mrItemLabelWhere.is_quantity = false;
        } else if (normalizedCategory === 'quality') {
          mrItemLabelWhere.is_quality = false;
        }
      }

      const partId = part ? Number(part) : null;
      const supplierId = supplier ? Number(supplier) : null;

      const partWhere = Number.isInteger(partId) ? { id: partId } : undefined;
      const supplierWhere = Number.isInteger(supplierId) ? { id: supplierId } : undefined;
      const supplierInclude = {
        model: SSuppliers,
        as: 'supplier',
        required: !!supplierId,
        attributes: ['id', 'name'],
        where: supplierWhere
      };

      const { count, rows: ngTickets } = await TNgTicket.findAndCountAll({
        where,
        attributes: ['id', 'ng_ticket_number', 'createdAt'],
        include: [
          {
            model: TMaterialReceivingItemLabel,
            as: 'mr_item_label',
            required: !!(category || partId || supplierId),
            where: Object.keys(mrItemLabelWhere).length ? mrItemLabelWhere : undefined,
            attributes: ['id', 'is_quantity', 'is_quality'],
            include: [
              {
                model: TPartLabels,
                as: 'label',
                required: !!partId,
                attributes: ['id', 'label_number'],
                include: [
                  {
                    model: SParts,
                    as: 'part',
                    required: !!partId,
                    attributes: ['id', 'part_number', 'part_name'],
                    where: partWhere
                  }
                ]
              },
              {
                model: TMaterialReceivingItem,
                as: 'material_receiving_item',
                required: !!supplierId,
                attributes: ['id'],
                include: [
                  {
                    model: TMaterialDeliveryOrderDetail,
                    as: 'mdo_detail',
                    required: !!supplierId,
                    attributes: ['id'],
                    include: [
                      {
                        model: SMaterialDeliveryOrder,
                        as: 'mdo',
                        required: !!supplierId,
                        attributes: ['id', 'number'],
                        include: [
                          {
                            model: SMaterialPurchaseOrder,
                            as: 'mpo',
                            required: !!supplierId,
                            attributes: ['id', 'number', 'supplier_id'],
                            include: [
                              supplierInclude
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

      const mappedData = await Promise.all(ngTickets.map(async (item) => {
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
                supplierInclude
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

  async getDropdownParts(req) {
    try {
      const parts = await db.sequelize.query(`
        SELECT DISTINCT
          part.id,
          part.part_number,
          part.part_name
        FROM t_ng_ticket ng
        JOIN t_material_receiving_item_label mr_il ON mr_il.id = ng.mr_item_label_id
        JOIN t_part_labels label ON label.id = mr_il.label_id
        JOIN s_parts part ON part.id = label.part_id
        WHERE ng.deleted_at IS NULL
          AND mr_il.deleted_at IS NULL
          AND label.deleted_at IS NULL
          AND part.deleted_at IS NULL
        ORDER BY part.part_number ASC
      `, {
        type: QueryTypes.SELECT
      });

      return { 
        status: true, 
        data: parts 
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

  async getDropdownSuppliers(req) {
    try {
      const suppliers = await db.sequelize.query(`
        SELECT DISTINCT
          supplier.id,
          supplier.name
        FROM t_ng_ticket ng
        JOIN t_material_receiving_item_label mr_il ON mr_il.id = ng.mr_item_label_id
        JOIN t_material_receiving_item mri ON mri.id = mr_il.mr_item_id
        JOIN s_material_delivery_order_details detail ON detail.id = mri.mdo_detail_id
        JOIN s_material_delivery_orders mdo ON mdo.id = detail.mdo_id
        JOIN s_material_purchase_orders mpo ON mpo.id = mdo.mpo_id
        JOIN s_suppliers supplier ON supplier.id = mpo.supplier_id
        WHERE ng.deleted_at IS NULL
          AND mr_il.deleted_at IS NULL
          AND mri.deleted_at IS NULL
          AND detail.deleted_at IS NULL
          AND mdo.deleted_at IS NULL
          AND mpo.deleted_at IS NULL
          AND supplier.deleted_at IS NULL
        ORDER BY supplier.name ASC
      `, {
        type: QueryTypes.SELECT
      });

      return { 
        status: true, 
        data: suppliers 
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