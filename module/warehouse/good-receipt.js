import { Op } from 'sequelize';
import Joi from 'joi';
import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import helper from '../../class/helper.class.js';
import BaseModule from "../../class/base.module.js";

const {
  SParts,
  SPackages,
  SUsers,
  SUserDetail,
  SSuppliers,
  SWarehouses,
  RefReceivingStatus,
  TMaterialReceiving,
  TMaterialReceivingItem,
  TMaterialReceivingItemLabel,
  TPartLabels,
  TNgTicket,
  TNgTicketQuantity,
  TNgTicketQuality,
  TGoodReceipt,
  SMaterialPurchaseOrder,
  SMaterialDeliveryOrder,
  TMaterialDeliveryOrderDetail
} = db;

class GoodReceiptModule extends BaseModule {
  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';
      const status_id = params.status_id;

      const where = {
        status_id: {
          [Op.in]: [
            4, // Waiting GR Approval
            5  // Good Receipt
          ]
        }
      };

      if (status_id) {
        where.status_id = status_id;
      }

      const include = [
        {
          model: RefReceivingStatus,
          as: 'status',
          attributes: ['id', 'name']
        },
        {
          model: SMaterialDeliveryOrder,
          as: 'mdo',
          attributes: ['id', 'number'],
          include: [
            {
              model: SMaterialPurchaseOrder,
              as: 'mpo',
              attributes: ['id', 'number'],
              include: [
                {
                  model: SSuppliers,
                  as: 'supplier',
                  attributes: ['id', 'name']
                }
              ]
            },
          ]
        },
        {
          model: TMaterialReceivingItem,
          as: 'items',
          required: false,
          attributes: ['id'],
          include: [
            {
              model: TMaterialReceivingItemLabel,
              as: 'labels',
              required: false,
              attributes: ['id', 'is_quantity', 'is_quality']
            }
          ]
        },
        {
          model: TGoodReceipt,
          as: 'good_receipt',
          required: false,
          attributes: ['id', 'remarks']
        }
      ];

      const rows = await TMaterialReceiving.findAll({
        where,
        attributes: ['id', 'received_at'],
        include,
        order: [['created_at', 'DESC']]
      });

      const mappedRows = rows.map((item) => {
        const labels = item.items?.flatMap((mrItem) => mrItem.labels || []) || [];
        const acceptedLabel = labels.filter((label) => label.is_quantity === true && label.is_quality === true).length;

        return {
          id: item.id,
          po_number: item.mdo?.mpo?.number || null,
          do_number: item.mdo?.number || null,
          supplier: item.mdo?.mpo?.supplier?.name || null,
          arrived_at: item.received_at || null,
          total_part: item.items.length,
          accepted_label: acceptedLabel,
          gr_status: item.status?.name || null,
          gr_remarks: item.good_receipt?.remarks || null
        };
      });

      let filteredRows = mappedRows;

      if (search) {
        const keyword = search.toLowerCase();

        filteredRows = mappedRows.filter(
          (item) =>
            item.do_number?.toLowerCase().includes(keyword) ||
            item.po_number?.toLowerCase().includes(keyword)
        );
      }

      const total = filteredRows.length;

      const paginatedRows = filteredRows.slice(
        offset,
        offset + limit
      );

      return {
        status: true,
        data: helper.getPaginationData(paginatedRows, total, page, limit)
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

  async detail(req) {
    try{
      const { mr_id } = req.params;
      
      const materialReceiving = await TMaterialReceiving.findByPk(mr_id, {
        attributes: ['id', 'received_at'],
        include: [
          {
            model: RefReceivingStatus,
            as: 'status',
            attributes: ['id', 'name']
          },
          {
            model: SMaterialDeliveryOrder,
            as: 'mdo',
            attributes: ['id', 'number'],
            include: [
              {
                model: SMaterialPurchaseOrder,
                as: 'mpo',
                attributes: ['id', 'number'],
                include: [
                  {
                    model: SSuppliers,
                    as: 'supplier',
                    attributes: ['id', 'name']
                  },
                  {
                    model: SWarehouses,
                    as: 'warehouse',
                    attributes: ['id', 'name']
                  }
                ]
              },
            ]
          },
          {
            model: TMaterialReceivingItem,
            as: 'items',
            attributes: ['id'],
            include: [
              {
                model: TMaterialDeliveryOrderDetail,
                as: 'mdo_detail',
                attributes: ['id'],
                include: [
                  {
                    model: SParts,
                    as: 'part',
                    attributes: ['id', 'part_number', 'part_name'],
                    include: [
                      {
                        model: SPackages,
                        as: 'package',
                        attributes: ['capacity']
                      }
                    ]
                  }
                ]
              },
              {
                model: TMaterialReceivingItemLabel,
                as: 'labels',
                required: false,
                attributes: ['id', 'is_quantity', 'is_quality', 'quantity_checked_at', 'quality_checked_at'],
                include: [
                  {
                    model: SUsers,
                    as: 'quantity_checker',
                    attributes: ['id'],
                    include: [
                      {
                        model: SUserDetail,
                        as: 'user_detail',
                        attributes: ['full_name']
                      }
                    ]
                  },
                  {
                    model: SUsers,
                    as: 'quality_checker',
                    attributes: ['id'],
                    include: [
                      {
                        model: SUserDetail,
                        as: 'user_detail',
                        attributes: ['full_name']
                      }
                    ]
                  },
                  {
                    model: TPartLabels,
                    as: 'label',
                    attributes: ['id', 'label_number']
                  },
                  {
                    model: TNgTicket,
                    as: 'ng_ticket',
                    required: false,
                    attributes: ['id', 'ng_ticket_number'],
                    include: [
                      {
                        model: TNgTicketQuantity,
                        as: 'quantity',
                        required: false,
                        attributes: ['expected_quantity', 'actual_quantity']
                      },
                      {
                        model: TNgTicketQuality,
                        as: 'qualities',
                        required: false,
                        attributes: ['id', 'image'],
                        include: [
                          {
                            model: SDefects,
                            as: 'defect',
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
      });

      if (!materialReceiving) {
        return {
          status: false,
          message: 'Material receiving not found',
          code: 404
        };
      }

      const mappedParts = (materialReceiving.items || []).map((item) => {
        const labels = item.labels || [];

        // Quantity summary
        const quantityOk = labels.filter((x) => x.is_quantity === true).length;
        const quantityNg = labels.filter((x) => x.is_quantity === false).length;

        // Quality summary
        const quantityAccepted = quantityOk;
        const qualityOk = labels.filter((x) => x.is_quality === true).length;
        const qualityNg = labels.filter((x) => x.is_quality === false).length;

        return {
          mr_item_id: item.id,
          part_number: item.mdo_detail?.part?.part_number || null,
          part_name: item.mdo_detail?.part?.part_name || null,
          quantity_summary: {
            expected: labels.length,
            accepted: quantityOk,
            rejected: quantityNg,
            submitted_at: item.quantity_checked_at || null
          },
          quality_summary: {
            expected: quantityAccepted,
            accepted: qualityOk,
            rejected: qualityNg,
            submitted_at: item.quality_checked_at || null
          },
          quantity_labels:labels.filter((x) => x.quantity_checked_at)
            .map((label) => ({
              id: label.id,
              label_number: label.label?.label_number || null,
              judgement: label.is_quantity === true ? 'OK' : 'NG',
              expected_qty: label.ng_ticket?.quantity?.expected_qty || item?.mdo_detail?.part?.package?.capacity || 0,
              actual_qty: label.is_quantity === true ? item?.mdo_detail?.part?.package?.capacity || 0 : label.ng_ticket?.quantity?.actual_qty || 0,
              ng_ticket_number: label.ng_ticket?.ng_ticket_number || null,
              scanned_at: label.quantity_checked_at
            })
          ),
          quality_labels: labels.filter((x) => x.quality_checked_at)
            .map((label) => ({
              id: label.id,
              label_number: label.label?.label_number || null,
              judgement: label.is_quality === true ? 'OK' : 'NG',
              defects: (label.ng_ticket?.qualities || []).map(
                (quality) => ({
                  id: quality.id,
                  defect_id: quality.defect?.id || null,
                  defect_name: quality.defect?.name || null,
                  image: quality.image
                })
              ),
              ng_ticket_number: label.ng_ticket?.ng_ticket_number || null,
              scanned_at: label.quality_checked_at
            })
          )
        };
      });

      return {
        status: true,
        data: {
          po_number: materialReceiving.mdo?.mpo?.number || null,
          do_number: materialReceiving.mdo?.number || null,
          supplier: materialReceiving.mdo?.mpo?.supplier?.name || null,
          warehouse: materialReceiving.mdo?.mpo?.warehouse?.name || null,
          arrived_at: materialReceiving.received_at || null,
          gr_status: materialReceiving.status?.name || null,
          parts: mappedParts
        }
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

  async approve(req) {
    const t = await db.sequelize.transaction();
    try {
      const { mr_id } = req.params;
      const data = req.body;

      const schema = Joi.object({
        remarks: Joi.string().allow('', null)
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const value = validation.value;

      const materialReceiving = await TMaterialReceiving.findByPk(
        mr_id,
        {
          attributes: ['id', 'status_id'],
          include: [
            {
              model: TGoodReceipt,
              as: 'good_receipt',
              required: false,
              attributes: ['id']
            }
          ],
          transaction: t
        }
      );

      if (!materialReceiving) {
        await t.rollback();
        return {
          status: false,
          message: 'Material receiving not found',
          code: 404
        };
      }

      if (materialReceiving.status_id !== 4) {
        await t.rollback();
        return {
          status: false,
          message: 'Material receiving is not waiting for GR approval',
          code: 400
        };
      }

      if (materialReceiving.good_receipt) {
        await t.rollback();
        return {
          status: false,
          message: 'Good receipt already exists',
          code: 400
        };
      }

      const goodReceipt = await TGoodReceipt.create(
        {
          mr_id: materialReceiving.id,
          remarks: value.remarks || null,
          approved_by: req.user.id,
          approved_at: new Date()
        },
        {
          transaction: t
        }
      );

      await materialReceiving.update(
        {
          status_id: 5 // Good Receipt
        },
        {
          transaction: t
        }
      );

      await t.commit();

      return {
        status: true,
        message: 'Material receiving has been approved successfully',
        data: {
          id: goodReceipt.id,
          mr_id: materialReceiving.id,
          status_id: 5,
          remarks: goodReceipt.remarks
        }
      };
    } catch (error) {
      await t.rollback();
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

export default new GoodReceiptModule();