import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op, fn, col, QueryTypes, where as sequelizeWhere } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from "../../class/base.module.js";
import Joi from 'joi';
import PdfPrinter from 'pdfmake/src/printer.js';
import QRCode from 'qrcode';
import dayjs from 'dayjs';
import path from 'path';

const { 
  SSuppliers,
  SPackages,
  SParts,
  SDefects,
  SWarehouses,
  SDocks,
  SMaterialPurchaseOrder,
  SMaterialDeliveryOrder,
  TMaterialDeliveryOrderDetail,
  RefReceivingStatus,
  TMaterialReceiving,
  TMaterialReceivingItem,
  TMaterialReceivingItemLabel,
  TPartLabels,
  TNgTicket,
  TNgTicketQuantity,
  TNgTicketQuality
} = db;

class MaterialReceivingModule extends BaseModule {
  async list(req) {
    try{
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';
      const status = params.status;
      const status_id = params.status_id;
      const start_date = params.start_date;
      const end_date = params.end_date;

      const where = {};

      if (search) {
        where.number = { [Op.iLike]: `%${search}%` };
      }

      if (start_date && end_date) {
        where[Op.and] = [
          sequelizeWhere(
            fn('DATE', col('target_date')),
            {
              [Op.between]: [start_date, end_date]
            }
          )
        ];
      } else if (start_date) {
        where[Op.and] = [
          sequelizeWhere(
            fn('DATE', col('target_date')),
            {
              [Op.gte]: start_date
            }
          )
        ];
      } else if (end_date) {
        where[Op.and] = [
          sequelizeWhere(
            fn('DATE', col('target_date')),
            {
              [Op.lte]: end_date
            }
          )
        ];
      }

      if (status === 'in transit') {
        where.status = 'in transit';

        where['$material_receiving.id$'] = {
          [Op.is]: null
        };
      }

      if (status_id) {
        where['$material_receiving.status_id$'] =
          status_id;
      }

      const include = [
        {
          model: SMaterialPurchaseOrder,
          as: 'mpo',
          attributes: ['id'],
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
        {
          model: SDocks,
          as: 'dock',
          attributes: ['id', 'name']
        },
        {
          model: TMaterialReceiving,
          as: 'material_receiving',
          required: false,
          attributes: ['id', 'received_at'],
          include: [
            {
              model: RefReceivingStatus,
              as: 'status',
              attributes: ['id', 'name']
            }
          ]
        }
      ]

      const { count, rows } = await SMaterialDeliveryOrder.findAndCountAll({
        where: {
          ...where,
          [Op.or]: [
            {
              status: 'in transit'
            },
            {
              '$material_receiving.id$': {
                [Op.not]: null
              }
            }
          ]
        },
        limit,
        offset,
        distinct: true,
        attributes: ['id', 'number', 'target_date', 'transporter', 'status'],
        include,
        order: [['created_at', 'DESC']]
      });

      // Mapping response
      const mappedRows = rows.map((item) => {
        const materialReceiving = item.material_receiving;

        return {
          id: item.id,
          number: item.number,
          target_date: item.target_date,
          supplier: item.mpo?.supplier?.name || null,
          warehouse: item.mpo?.warehouse?.name || null,
          dock: item.dock?.name || null,
          transporter: item.transporter,
          arrived_at: materialReceiving?.received_at || null,
          status: materialReceiving?.status?.name || item.status.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        };
      });

      return {
        status: true,
        data: helper.getPaginationData(mappedRows, count, page, limit)
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
      const id = req.params.id;

      const materialDeliveryOrder = await SMaterialDeliveryOrder.findByPk(id, {
        attributes: ['id', 'number', 'description', 'target_date', 'transporter', 'status'],
        include: [
          {
            model: SMaterialPurchaseOrder,
            as: 'mpo',
            attributes: ['id'],
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
          {
            model: SDocks,
            as: 'dock',
            attributes: ['id', 'name']
          },
          {
            model: TMaterialReceiving,
            as: 'material_receiving',
            required: false,
            attributes: ['id', 'received_at', 'remarks'],
            include: [
              {
                model: RefReceivingStatus,
                as: 'status',
                attributes: ['id', 'name']
              }
            ]
          },
          {
            model: TMaterialDeliveryOrderDetail,
            as: 'mdo_details',
            attributes: ['id', 'qty'],
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['id', 'part_number', 'part_name']
              }
            ]
          }
        ]
      });

      if (!materialDeliveryOrder) {
        return {
          status: false,
          message: 'Material Delivery Order not found',
          code: 404
        };
      }

      const mr = materialDeliveryOrder.material_receiving;

      const mappedData = {
        id: materialDeliveryOrder.id,
        number: materialDeliveryOrder.number,
        description: materialDeliveryOrder.description,
        supplier: {
          id: materialDeliveryOrder.mpo?.supplier?.id || null,
          name: materialDeliveryOrder.mpo?.supplier?.name || null
        },
        warehouse: {
          id: materialDeliveryOrder.mpo?.warehouse?.id || null,
          name: materialDeliveryOrder.mpo?.warehouse?.name || null
        },
        dock: {
          id: materialDeliveryOrder.dock?.id || null,
          name: materialDeliveryOrder.dock?.name || null
        },
        transporter: materialDeliveryOrder.transporter,
        target_date: materialDeliveryOrder.target_date,
        arrived_at: mr?.received_at || null,
        remarks: mr?.remarks || null,
        status: mr?.status?.name || materialDeliveryOrder.status.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        items: materialDeliveryOrder.mdo_details.map(
          (item) => ({
            id: item.id,
            part: {
              id: item.part?.id || null,
              part_number: item.part?.part_number || null,
              part_name: item.part?.part_name || null
            },
            qty: item.qty
          })
        )
      };

      return {
        status: true,
        data: mappedData
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

  async arrived(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;
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

      const materialDeliveryOrder = await SMaterialDeliveryOrder.findByPk(
        id, 
        {
          include: [
            {
              model: TMaterialDeliveryOrderDetail,
              as: 'mdo_details',
              include: [
                {
                  model: SParts,
                  as: 'part',
                  attributes: ['id', 'part_number', 'part_name']
                }
              ]
            }
          ],
          transaction: t
        }
      );

      if (!materialDeliveryOrder) {
        await t.rollback();
        return {
          status: false,
          message: 'Material Delivery Order not found',
          code: 404
        };
      }

      if (materialDeliveryOrder.status !== 'in transit') {
        await t.rollback();
        return {
          status: false,
          message: 'Only in transit material delivery orders can be marked as arrived',
          code: 400
        };
      }

      const existingReceiving = await TMaterialReceiving.findOne({
        where: {
          mdo_id: id
        },
        transaction: t
      });

      if (existingReceiving) {
        await t.rollback();
        return {
          status: false,
          message: 'Material already arrived',
          code: 400
        };
      }

      const arrivedAt = new Date();

      // Update Delivery Order
      await materialDeliveryOrder.update(
        { status: 'arrived' },
        { transaction: t }
      );

      // Create Material Receiving
      const materialReceiving = await TMaterialReceiving.create(
        {
          mdo_id: materialDeliveryOrder.id,
          status_id: 1, // Arrived
          received_at: arrivedAt,
          remarks: value.remarks || null,
          received_by: req.user.id
        },
        {
          transaction: t
        }
      );

      // Format date for label
      const dateStr = dayjs(arrivedAt).format('YYMMDD');

      // Create Material Receiving Items & Labels
      for (const item of materialDeliveryOrder.mdo_details) {
        // Create Material Receiving Item
        const materialReceivingItem = await TMaterialReceivingItem.create(
          {
            mr_id: materialReceiving.id,
            mdo_detail_id: item.id
          },
          {
            transaction: t
          }
        );

        // Generate Label
        const prefix = `MDO-${item.part.part_number}-${dateStr}-`;

        const lastLabel = await TPartLabels.findOne({
          where: {
            label_number: { [Op.like]: `${prefix}%` }
          },
          order: [['label_number', 'DESC']],
          transaction: t
        });

        let nextNumber = 1;

        if (lastLabel) {
          const lastSeq = parseInt(lastLabel.label_number.split('-').pop(), 10);
          nextNumber = lastSeq + 1;
        }

        const materialReceivingItemLabels = [];

        // Create label per qty
        for (let i = 0; i < item.qty; i++) {
          const labelNumber = `${prefix}${String(nextNumber + i).padStart(6, '0')}`;

          // Save to TPartLabels first
          const partLabel = await TPartLabels.create(
            {
              label_number: labelNumber,
              part_id: item.part_id
            },
            {
              transaction: t
            }
          );

          // Prepare MR Item Label relation
          materialReceivingItemLabels.push({
            mr_item_id: materialReceivingItem.id,
            label_id: partLabel.id
          });
        }

        if (materialReceivingItemLabels.length) {
          await TMaterialReceivingItemLabel.bulkCreate(
            materialReceivingItemLabels,
            {
              transaction: t
            }
          );
        }
      }

      await t.commit();

      return {
        status: true,
        message: 'Material delivery order has been marked as arrived',
        data: {
          id: materialReceiving.id
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

  async updateMdoStatus(
    materialReceivingId,
    transaction = null
  ) {

    const items =
      await TMaterialReceivingItem.findAll({
        where: {
          mr_id:
            materialReceivingId
        },

        attributes: [
          'quantity_checked_at',
          'quality_checked_at'
        ],

        transaction
      });

    if (!items.length) {
      return;
    }

    const allQtyChecked =
      items.every(
        (item) =>
          item.quantity_checked_at
      );

    const allQualityChecked =
      items.every(
        (item) =>
          item.quality_checked_at
      );

    const hasQtyChecking =
      items.some(
        (item) =>
          item.quantity_checked_at
      );

    const hasQualityChecking =
      items.some(
        (item) =>
          item.quality_checked_at
      );

    let status_id = 1; // Arrived

    if (hasQtyChecking) {
      status_id = 2; // Quantity Checking
    }

    if (hasQualityChecking) {
      status_id = 3; // Quality Checking
    }

    if (
      allQtyChecked &&
      allQualityChecked
    ) {
      status_id = 4; // Waiting GR Approval
    }

    await TMaterialReceiving.update(
      {
        status_id
      },
      {
        where: {
          id: materialReceivingId
        },

        transaction
      }
    );
  }

  async progress(req) {
    try {
      const id = req.params.id;

      const materialDeliveryOrder = await SMaterialDeliveryOrder.findByPk(id, {
        attributes: ['id', 'number', 'target_date', 'status'],
        include: [
          {
            model: SMaterialPurchaseOrder,
            as: 'mpo',
            attributes: ['id'],
            include: [
              {
                model: SWarehouses,
                as: 'warehouse',
                attributes: ['id', 'name']
              }
            ]
          },
          {
            model: SDocks,
            as: 'dock',
            attributes: ['id', 'name']
          },
          {
            model: TMaterialDeliveryOrderDetail,
            as: 'mdo_details',
            attributes: ['id', 'qty'],
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['id', 'part_number', 'part_name']
              }
            ]
          },
          {
            model: TMaterialReceiving,
            as: 'material_receiving',
            required: false,
            attributes: ['id', 'received_at'],
            include: [
              {
                model: RefReceivingStatus,
                as: 'status',
                attributes: ['id', 'name']
              },
              {
                model: TMaterialReceivingItem,
                as: 'items',
                attributes: ['id', 'mdo_detail_id', 'quantity_checked_at', 'quality_checked_at'],
                include: [
                  {
                    model: TMaterialReceivingItemLabel,
                    as: 'labels',
                    attributes: ['id', 'is_quantity', 'is_quality']
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!materialDeliveryOrder) {
        return {
          status: false,
          message:
            'Material delivery order not found',
          code: 404
        };
      }

      const mr = materialDeliveryOrder.material_receiving;

      const mappedData = {
        id: materialDeliveryOrder.id,
        number: materialDeliveryOrder.number,
        status: mr?.status?.name || materialDeliveryOrder.status.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        target_date: materialDeliveryOrder.target_date,
        arrived_at: mr?.received_at || null,
        warehouse: materialDeliveryOrder.mpo?.warehouse?.name || null,
        dock: materialDeliveryOrder.dock?.name || null,

        items: materialDeliveryOrder.mdo_details.map((detail) => {
          const mrItem = mr?.items?.find(item => item.mdo_detail_id === detail.id);
          const itemLabels = mrItem?.labels || [];

          // Total Qty Actual
          const totalQtyActual = mrItem?.quantity_checked_at ? itemLabels.filter(label => label.is_quantity === true).length : null;

          // Quality Check OK
          const qualityCheckOk = mrItem?.quality_checked_at ? itemLabels.filter(label => label.is_quality === true).length : null;

          // Quality Check NG
          const qualityCheckNg = mrItem?.quality_checked_at ? itemLabels.filter(label => label.is_quality === false).length : null;

          return {
            id: detail.id,
            mr_item_id: mrItem?.id || null,
            part_number: detail.part?.part_number || null,
            part_name: detail.part?.part_name || null,
            total_qty: detail.qty || 0,
            total_qty_actual: totalQtyActual,
            quantity_checked_at: mrItem?.quantity_checked_at,
            quality_check_ok: qualityCheckOk,
            quality_check_ng: qualityCheckNg,
            quality_checked_at: mrItem?.quality_checked_at,
          };
        }) || []
      };

      return {
        status: true,
        data: mappedData
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

  async quantityCheckingDetail(req) {
    try {
      const { mdo_detail_id } = req.params;

      const materialReceivingItem = await TMaterialReceivingItem.findOne({
        where: { mdo_detail_id },
        attributes: ['id', 'quantity_checked_at'],
        include: [
          {
            model: TMaterialReceiving,
            as: 'material_receiving',
            attributes: ['id', 'received_at'],
            include: [
              {
                model: SMaterialDeliveryOrder,
                as: 'mdo',
                attributes: ['id', 'number', 'target_date'],
                include: [
                  {
                    model: SMaterialPurchaseOrder,
                    as: 'mpo',
                    attributes: ['id'],
                    include: [
                      {
                        model: SWarehouses,
                        as: 'warehouse',
                        attributes: ['id', 'name']
                      }
                    ]
                  },
                  {
                    model: SDocks,
                    as: 'dock',
                    attributes: ['id', 'name']
                  }
                ]
              }
            ]
          },
          {
            model: TMaterialDeliveryOrderDetail,
            as: 'mdo_detail',
            attributes: ['id', 'qty'],
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
            attributes: ['id', 'is_quantity', 'quantity_checked_at'],
            include: [
              {
                model: TPartLabels,
                as: 'label',
                attributes: ['label_number']
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
                    attributes: ['expected_qty', 'actual_qty']
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!materialReceivingItem) {
        return {
          status: false,
          message: 'Material receiving item not found',
          code: 404
        };
      }

      const checkedLabels = (materialReceivingItem.labels || [])
        .filter((item) => item.quantity_checked_at !== null)
        .sort(
          (a, b) =>
            new Date(b.quantity_checked_at) -
            new Date(a.quantity_checked_at)
        );
        
      const totalQty = materialReceivingItem.mdo_detail?.qty || 0;
      const checkedQty = checkedLabels.length;

      const mappedData = {
        id: materialReceivingItem.mdo_detail?.id,
        mr_item_id: materialReceivingItem.id,
        mdo_number: materialReceivingItem.material_receiving?.mdo?.number || null,
        warehouse: materialReceivingItem.material_receiving?.mdo?.mpo?.warehouse?.name || null,
        dock: materialReceivingItem.material_receiving?.mdo?.dock?.name || null,
        target_date: materialReceivingItem.material_receiving?.mdo?.target_date || null,
        arrived_at: materialReceivingItem.material_receiving?.received_at || null,
        submitted_at: materialReceivingItem.quantity_checked_at || null,

        part: {
          part_number: materialReceivingItem.mdo_detail?.part?.part_number || null,
          part_name: materialReceivingItem.mdo_detail?.part?.part_name || null,
          qty_per_kanban: materialReceivingItem.mdo_detail?.part?.package?.capacity || null,
          total_qty: totalQty,
          checked_qty: checkedQty,
          remaining_qty: totalQty - checkedQty
        },

        labels: checkedLabels.map((item) => ({
          id: item.id,
          label_number: item.label?.label_number || null,
          judgement: item.is_quantity === true ? 'OK' : 'NG',
          scanned_at: item.quantity_checked_at,
          ng_ticket: item.ng_ticket
            ? {
              id: item.ng_ticket.id,
              ng_ticket_number: item.ng_ticket.ng_ticket_number,
              expected_qty: item.ng_ticket?.quantity?.expected_qty || null,
              actual_qty: item.ng_ticket?.quantity?.actual_qty || null
            }
            : null
        }))
      };

      return {
        status: true,
        data: mappedData
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

  async scanQuantityLabel(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;

      const schema = Joi.object({
        label_number: Joi.string().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const value = validation.value;

      const materialReceivingItemLabel = await TMaterialReceivingItemLabel.findOne({
        attributes: ['id', 'quantity_checked_at'],
        include: [
          {
            model: TPartLabels,
            as: 'label',
            where: {
              label_number: value.label_number
            },
            attributes: ['id', 'label_number']
          },
          {
            model: TMaterialReceivingItem,
            as: 'material_receiving_item',
            attributes: ['id', 'mdo_detail_id']
          }
        ],
        transaction: t
      });

      if (!materialReceivingItemLabel) {
        await t.rollback();
        return {
          status: false,
          message: 'Label not found',
          code: 404
        };
      }

      if (materialReceivingItemLabel.quantity_checked_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Label has already been scanned',
          code: 400
        };
      }

      const checkedAt = new Date();

      await materialReceivingItemLabel.update(
        {
          is_quantity: true,
          quantity_checked_at: checkedAt,
          quantity_checked_by: req.user.id
        },
        {
          transaction: t
        }
      );

      await t.commit();

      return {
        status: true,
        message: 'Label scanned successfully',
        data: {
          id: materialReceivingItemLabel.id,
          mr_item_id: materialReceivingItemLabel.material_receiving_item?.id || null,
          mdo_detail_id: materialReceivingItemLabel.material_receiving_item?.mdo_detail_id || null,
          label_number: materialReceivingItemLabel.label?.label_number || null,
          judgement: 'OK',
          scanned_at: checkedAt
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

  async markQuantityIncomplete(req) {
    const t = await db.sequelize.transaction();
    try {
      const { mr_item_label_id } = req.params;
      const data = req.body;

      const schema = Joi.object({
        actual_qty: Joi.number().integer().min(0).required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const value = validation.value;

      const materialReceivingItemLabel = await TMaterialReceivingItemLabel.findByPk(mr_item_label_id, {
        attributes: ['id', 'is_quantity', 'quantity_checked_at'],
        include: [
          {
            model: TMaterialReceivingItem,
            as: 'material_receiving_item',
            attributes: ['id', 'quantity_checked_at'],
            include: [
              {
                model: TMaterialDeliveryOrderDetail,
                as: 'mdo_detail',
                attributes: ['id'],
                include: [
                  {
                    model: SParts,
                    as: 'part',
                    attributes: ['id'],
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
                mode: TPartLabels,
                as: 'label',
                attributes: ['label_number']
              }
            ]
          }
        ],
        transaction: t
      });

      if (!materialReceivingItemLabel) {
        await t.rollback();
        return {
          status: false,
          message: 'Material receiving item label not found',
          code: 404
        };
      }

      if (!materialReceivingItemLabel.quantity_checked_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Label has not been scanned yet',
          code: 400
        };
      }

      if (materialReceivingItemLabel.is_quantity === false) {
        await t.rollback();
        return {
          status: false,
          message: 'Label has already been marked as incomplete',
          code: 400
        };
      }

      if (materialReceivingItemLabel.material_receiving_item?.quantity_checked_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Quantity checking has already been submitted',
          code: 400
        };
      }

      const packageCapacity = Number(materialReceivingItemLabel.material_receiving_item?.mdo_detail?.part?.package?.capacity || 0);

      if (value.actual_qty >= packageCapacity) {
        await t.rollback();
        return {
          status: false,
          message: 'Actual quantity must be less than expected quantity',
          code: 400
        };
      }

      await materialReceivingItemLabel.update(
        {
          is_quantity: false
        },
        {
          transaction: t
        }
      );

      // Generate NG Ticket Number
      const dateStr = dayjs().format('YYMMDD');
      const prefix = `NGQ-${dateStr}-`;

      const lastTicket = await TNgTicket.findOne({
        where: {
          ng_ticket_number: {
            [Op.like]: `${prefix}%`
          }
        },
        order: [['ng_ticket_number', 'DESC']],
        transaction: t
      });

      let nextNumber = 1;
      if (lastTicket) {
        const lastSeq = parseInt(lastTicket.ng_ticket_number.split('-').pop(), 10);
        nextNumber = lastSeq + 1;
      }

      const ngTicketNumber = `${prefix}${String(nextNumber).padStart(6, '0')}`;

      const ngTicket = await TNgTicket.create(
        {
          mr_item_label_id: materialReceivingItemLabel.id,
          ng_ticket_number: ngTicketNumber,
          created_by: req.user.id
        },
        {
          transaction: t
        }
      );

      await TNgTicketQuantity.create(
        {
          ng_ticket_id: ngTicket.id,
          expected_qty: packageCapacity,
          actual_qty: value.actual_qty
        },
        {
          transaction: t
        }
      );

      await t.commit();

      return {
        status: true,
        message: 'Label has been marked as incomplete',
        data: {
          id: materialReceivingItemLabel.id,
          label_number: materialReceivingItemLabel.label?.label_number || null,
          judgement: 'NG',
          ng_ticket: {
            id: ngTicket.id,
            ng_ticket_number: ngTicket.ng_ticket_number
          }
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

  async editQuantityIncomplete(req) {
    const t = await db.sequelize.transaction();
    try {
      const { mr_item_label_id } = req.params;
      const data = req.body;

      const schema = Joi.object({
        actual_qty: Joi.number().integer().min(0).required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const value = validation.value;

      const materialReceivingItemLabel = await TMaterialReceivingItemLabel.findByPk(mr_item_label_id, {
        attributes: ['id', 'is_quantity'],
        include: [
          {
            model: TNgTicket,
            as: 'ng_ticket',
            required: false,
            include: [
              {
                model: TNgTicketQuantity,
                as: 'quantity',
                attributes: ['id', 'expected_qty', 'actual_qty']
              }
            ]
          },
          {
            model: TMaterialReceivingItem,
            as: 'material_receiving_item',
            attributes: ['id', 'quantity_checked_at'],
            include: [
              {
                model: TMaterialDeliveryOrderDetail,
                as: 'mdo_detail',
                include: [
                  {
                    model: SParts,
                    as: 'part',
                    include: [
                      {
                        model: SPackages,
                        as: 'package',
                        attributes: ['capacity']
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        transaction: t
      });

      if (!materialReceivingItemLabel) {
        await t.rollback();
        return {
          status: false,
          message: 'Material Receiving Item Label not found',
          code: 404
        };
      }

      // Validate NG quantity
      if (materialReceivingItemLabel.is_quantity !== false) {
        await t.rollback();
        return {
          status: false,
          message: 'Label is not marked as incomplete',
          code: 400
        };
      }

      // Validate existing NG ticket
      if (!materialReceivingItemLabel.ng_ticket) {
        await t.rollback();
        return {
          status: false,
          message: 'NG ticket not found',
          code: 404
        };
      }

      if (materialReceivingItemLabel.material_receiving_item?.quantity_checked_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Quantity checking has already been submitted',
          code: 400
        };
      }

      const expectedQty = Number(materialReceivingItemLabel.material_receiving_item?.mdo_detail?.part?.package?.capacity || 0);

      // Validate actual qty
      if (value.actual_qty >= expectedQty) {
        await t.rollback();
        return {
          status: false,
          message: 'Actual quantity must be less than expected quantity',
          code: 400
        };
      }

      // Update NG Ticket Quantity
      await materialReceivingItemLabel
        .ng_ticket
        .quantity
        .update(
          {
            actual_qty: value.actual_qty
          },
          {
            transaction: t
          }
        );

      await t.commit();

      return {
        status: true,
        message: 'Quantity incomplete has been updated successfully'
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

  async submitQuantityChecking(req) {
    const t = await db.sequelize.transaction();
    try {
      const { mdo_detail_id } = req.params;

      const materialReceivingItem = await TMaterialReceivingItem.findOne({
        where: {
          mdo_detail_id
        },
        attributes: ['id', 'mr_id', 'quantity_checked', 'quantity_checked_at'],
        include: [
          {
            model: TMaterialReceivingItemLabel,
            as: 'labels',
            attributes: ['id', 'is_quantity', 'quantity_checked_at'],
            include: [
              {
                model: TPartLabels,
                as: 'label',
                attributes: ['id', 'label_number']
              },
              {
                model: TNgTicket,
                as: 'ng_ticket',
                required: false,
                attributes: ['id']
              }
            ]
          },
          {
            model: TMaterialDeliveryOrderDetail,
            as: 'mdo_detail',
            attributes: ['id'],
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['id'],
                include: [
                  {
                    model: SPackages,
                    as: 'package',
                    attributes: ['capacity']
                  }
                ]
              }
            ]
          }
        ],
        transaction: t
      });

      if (!materialReceivingItem) {
        await t.rollback();
        return {
          status: false,
          message: 'Material receiving item not found',
          code: 404
        };
      }

      if (materialReceivingItem.quantity_checked_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Quantity checking has already been submitted',
          code: 400
        };
      }

      const packageCapacity = Number(materialReceivingItem.mdo_detail?.part?.package?.capacity || 0);

      const uncheckedLabels = (materialReceivingItem.labels || []).filter((item) => item.quantity_checked_at === null);

      for (const item of uncheckedLabels) {
        if (item.ng_ticket) {
          continue;
        }
        
        await item.update(
          {
            is_quantity: false
          },
          {
            transaction: t
          }
        );

        // Generate NG Ticket Number
        const dateStr = dayjs().format('YYMMDD');
        const prefix = `NGQ-${dateStr}-`;

        const lastTicket = await TNgTicket.findOne({
          where: {
            ng_ticket_number: {
              [Op.like]: `${prefix}%`
            }
          },
          order: [['ng_ticket_number', 'DESC']],
          transaction: t
        });

        let nextNumber = 1;
        if (lastTicket) {
          const lastSeq = parseInt(lastTicket.ng_ticket_number.split('-').pop(), 10);
          nextNumber = lastSeq + 1;
        }

        const ngTicketNumber = `${prefix}${String(nextNumber).padStart(6, '0')}`;

        const ngTicket = await TNgTicket.create(
          {
            mr_item_label_id: item.id,
            ng_ticket_number: ngTicketNumber,
            created_by: req.user.id
          },
          {
            transaction: t
          }
        );

        await TNgTicketQuantity.create(
          {
            ng_ticket_id: ngTicket.id,
            expected_qty: packageCapacity,
            actual_qty: 0
          },
          {
            transaction: t
          }
        );
      }

      const submittedAt = new Date();

      await materialReceivingItem.update(
        {
          quantity_checked: true,
          quantity_checked_at: submittedAt
        },
        {
          transaction: t
        }
      );

      await this.updateMdoStatus(materialReceivingItem.mr_id, t);

      await t.commit();

      return {
        status: true,
        message: 'Quantity checking has been submitted successfully',
        data: {
          id: materialReceivingItem.id,
          quantity_checked: true,
          quantity_checked_at: submittedAt,
          auto_ng_count: uncheckedLabels.length
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

  async qualityCheckingDetail(req) {
    try {
      const { mdo_detail_id } = req.params;

      const materialReceivingItem = await TMaterialReceivingItem.findOne({
        where: { mdo_detail_id },
        attributes: ['id', 'quality_checked_at'],
        include: [
          {
            model: TMaterialReceiving,
            as: 'material_receiving',
            attributes: ['id', 'received_at'],
            include: [
              {
                model: SMaterialDeliveryOrder,
                as: 'mdo',
                attributes: ['id', 'number', 'target_date'],
                include: [
                  {
                    model: SMaterialPurchaseOrder,
                    as: 'mpo',
                    attributes: ['id'],
                    include: [
                      {
                        model: SWarehouses,
                        as: 'warehouse',
                        attributes: ['id', 'name']
                      }
                    ]
                  },
                  {
                    model: SDocks,
                    as: 'dock',
                    attributes: ['id', 'name']
                  }
                ]
              }
            ]
          },
          {
            model: TMaterialDeliveryOrderDetail,
            as: 'mdo_detail',
            attributes: ['id', 'qty'],
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
            attributes: ['id', 'is_quantity', 'is_quality', 'quality_checked_at'],
            include: [
              {
                model: TPartLabels,
                as: 'label',
                attributes: ['label_number']
              },
              {
                model: TNgTicket,
                as: 'ng_ticket',
                required: false,
                attributes: ['id', 'ng_ticket_number'],
                include: [
                  {
                    model: TNgTicketQuality,
                    as: 'qualities',
                    required: false,
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
                ]
              }
            ]
          }
        ]
      });

      if (!materialReceivingItem) {
        return {
          status: false,
          message: 'Material Receiving Item not found',
          code: 404
        };
      }

      const acceptedLabels = (materialReceivingItem.labels || [])
        .filter((item) => item.is_quantity === true);

      const checkedLabels = acceptedLabels
        .filter((item) => item.quality_checked_at !== null)
        .sort(
          (a, b) =>
            new Date(b.quality_checked_at) -
            new Date(a.quality_checked_at)
        );

      const totalQty = acceptedLabels.length;
      const checkedQty = checkedLabels.length;

      const mappedData = {
        id: materialReceivingItem.mdo_detail?.id,
        mr_item_id: materialReceivingItem.id,
        mdo_number: materialReceivingItem.material_receiving?.mdo?.number || null,
        warehouse: materialReceivingItem.material_receiving?.mdo?.mpo?.warehouse?.name || null,
        dock: materialReceivingItem.material_receiving?.mdo?.dock?.name || null,
        target_date: materialReceivingItem.material_receiving?.mdo?.target_date || null,
        arrived_at: materialReceivingItem.material_receiving?.received_at || null,
        submitted_at: materialReceivingItem.quality_checked_at || null,

        part: {
          part_number: materialReceivingItem.mdo_detail?.part?.part_number || null,
          part_name: materialReceivingItem.mdo_detail?.part?.part_name || null,
          qty_per_kanban: materialReceivingItem.mdo_detail?.part?.package?.capacity || null,
          total_qty: totalQty,
          checked_qty: checkedQty,
          remaining_qty: totalQty - checkedQty
        },

        labels: checkedLabels.map((item) => ({
          id: item.id,
          label_number: item.label?.label_number || null,
          judgement: item.is_quality === true ? 'OK' : 'NG',
          scanned_at: item.quality_checked_at,
          ng_ticket: item.ng_ticket
            ? {
              id: item.ng_ticket.id,
              ng_ticket_number: item.ng_ticket.ng_ticket_number,
              defects: (item.ng_ticket?.qualities || []).map(
                (quality) => ({
                  id: quality.id,
                  defect_id: quality.defect?.id || null,
                  defect_name: quality.defect?.name || null,
                  image: quality.image
                })
              )
            }
            : null
        }))
      };

      return {
        status: true,
        data: mappedData
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

  async scanQualityLabel(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;

      const schema = Joi.object({
        label_number: Joi.string().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const value = validation.value;

      const materialReceivingItemLabel = await TMaterialReceivingItemLabel.findOne({
        attributes: ['id', 'quality_checked_at'],
        include: [
          {
            model: TPartLabels,
            as: 'label',
            where: {
              label_number: value.label_number
            },
            attributes: ['id', 'label_number']
          },
          {
            model: TMaterialReceivingItem,
            as: 'material_receiving_item',
            attributes: ['id', 'mdo_detail_id']
          }
        ],
        transaction: t
      });

      if (!materialReceivingItemLabel) {
        await t.rollback();
        return {
          status: false,
          message: 'Label not found',
          code: 404
        };
      }

      if (materialReceivingItemLabel.quality_checked_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Label has already been scanned',
          code: 400
        };
      }

      const checkedAt = new Date();

      await materialReceivingItemLabel.update(
        {
          is_quality: true,
          quality_checked_at: checkedAt,
          quality_checked_by: req.user.id
        },
        {
          transaction: t
        }
      );

      await t.commit();

      return {
        status: true,
        message: 'Label scanned successfully',
        data: {
          id: materialReceivingItemLabel.id,
          mr_item_id: materialReceivingItemLabel.material_receiving_item?.id || null,
          mdo_detail_id: materialReceivingItemLabel.material_receiving_item?.mdo_detail_id || null,
          label_number: materialReceivingItemLabel.label?.label_number || null,
          judgement: 'OK',
          scanned_at: checkedAt
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

  async markQualityDefect(req) {
    const t = await db.sequelize.transaction();
    try {
      const { mr_item_label_id } = req.params;
      const data = req.body;

      const schema = Joi.object({
        defects: Joi.array()
          .items(
            Joi.object({
              defect_id: Joi.number().integer().required(),
              image: Joi.string().allow('', null)
            })
          )
          .min(1)
          .required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const value = validation.value;

      const defectIds = value.defects.map((item) => item.defect_id);
      const uniqueDefectIds = [...new Set(defectIds)];

      if (defectIds.length !== uniqueDefectIds.length) {
        await t.rollback();
        return {
          status: false,
          message: 'Duplicate defect is not allowed',
          code: 400
        };
      }

      const materialReceivingItemLabel = await TMaterialReceivingItemLabel.findByPk(mr_item_label_id, {
        attributes: ['id', 'is_quantity', 'is_quality', 'quality_checked_at'],
        include: [
          {
            model: TMaterialReceivingItem,
            as: 'material_receiving_item',
            attributes: ['id', 'quality_checked_at'],
            include: [
              {
                model: TMaterialDeliveryOrderDetail,
                as: 'mdo_detail',
                attributes: ['id'],
                include: [
                  {
                    model: SParts,
                    as: 'part',
                    attributes: ['id']
                  }
                ]
              }
            ]
          },
          {
            model: TPartLabels,
            as: 'label',
            attributes: ['id', 'label_number']
          }
        ],
        transaction: t
      });

      if (!materialReceivingItemLabel) {
        await t.rollback();
        return {
          status: false,
          message: 'Material Receiving Item Label not found',
          code: 404
        };
      }

      if (materialReceivingItemLabel.is_quantity !== true) {
        await t.rollback();
        return {
          status: false,
          message: 'Label did not pass quantity checking',
          code: 400
        };
      }

      if (!materialReceivingItemLabel.quality_checked_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Label has not been scanned yet',
          code: 400
        };
      }

      if (materialReceivingItemLabel.is_quality === false) {
        await t.rollback();
        return {
          status: false,
          message: 'Label has already been marked as defect',
          code: 400
        };
      }

      // Validate QC not submitted yet
      if (materialReceivingItemLabel.material_receiving_item?.quality_checked_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Quality checking has already been submitted',
          code: 400
        };
      }

      // Update label as defect
      await materialReceivingItemLabel.update(
        {
          is_quality: false
        },
        {
          transaction: t
        }
      );

      // Generate NG Ticket Number
      const dateStr = dayjs().format('YYMMDD');
      const prefix = `NGQL-${dateStr}-`;

      const lastTicket = await TNgTicket.findOne({
        where: {
          ng_ticket_number: {
            [Op.like]: `${prefix}%`
          }
        },
        order: [['ng_ticket_number', 'DESC']],
        transaction: t
      });

      let nextNumber = 1;
      if (lastTicket) {
        const lastNumber = parseInt(lastTicket.ng_ticket_number.split('-')[2]);
        nextNumber = lastNumber + 1;
      }

      const ngTicketNumber = `${prefix}${String(nextNumber).padStart(6, '0')}`;

      const ngTicket = await TNgTicket.create(
        {
          mr_item_label_id: materialReceivingItemLabel.id,
          ng_ticket_number: ngTicketNumber,
          created_by: req.user.id
        },
        {
          transaction: t
        }
      );

      // Create NG Ticket Quality
      const ngQualities = value.defects.map(
        (item) => ({
          ng_ticket_id: ngTicket.id,
          defect_id: item.defect_id,
          image: item.image || null
        })
      );

      await TNgTicketQuality.bulkCreate(
        ngQualities,
        {
          transaction: t
        }
      );

      await t.commit();

      return {
        status: true,
        message: 'Label has been marked as defect',
        data: {
          id: materialReceivingItemLabel.id,
          label_number: materialReceivingItemLabel.label?.label_number || null,
          judgement: 'NG',
          ng_ticket: {
            id: ngTicket.id,
            ng_ticket_number: ngTicket.ng_ticket_number
          }
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

  async editQualityDefect(req) {
    const t = await db.sequelize.transaction();
    try {
      const { mr_item_label_id } = req.params;
      const data = req.body;

      const schema = Joi.object({
        defects: Joi.array()
          .items(
            Joi.object({
              defect_id: Joi.number().integer().required(),
              image: Joi.string().allow('', null)
            })
          )
          .min(1)
          .required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const value = validation.value;

      const defectIds = value.defects.map((item) => item.defect_id);
      const uniqueDefectIds = [...new Set(defectIds)];

      if (defectIds.length !== uniqueDefectIds.length) {
        await t.rollback();
        return {
          status: false,
          message: 'Duplicate defect is not allowed',
          code: 400
        };
      }

      const materialReceivingItemLabel = await TMaterialReceivingItemLabel.findByPk(mr_item_label_id, {
        attributes: ['id', 'is_quality'],
        include: [
          {
            model: TNgTicket,
            as: 'ng_ticket',
            required: false,
            include: [
              {
                model: TNgTicketQuality,
                as: 'qualities',
                attributes: ['id']
              }
            ]
          },
          {
            model: TMaterialReceivingItem,
            as: 'material_receiving_item',
            attributes: ['id', 'quality_checked_at']
          }
        ],
        transaction: t
      });

      if (!materialReceivingItemLabel) {
        await t.rollback();
        return {
          status: false,
          message: 'Material Receiving Item Label not found',
          code: 404
        };
      }

      // Validate NG quality
      if (materialReceivingItemLabel.is_quality !== false) {
        await t.rollback();
        return {
          status: false,
          message: 'Label is not marked as defect',
          code: 400
        };
      }

      // Validate NG ticket exists
      if (!materialReceivingItemLabel.ng_ticket) {
        await t.rollback();
        return {
          status: false,
          message: 'NG ticket not found',
          code: 404
        };
      }

      // Validate QC not submitted yet
      if (materialReceivingItemLabel.material_receiving_item?.quality_checked_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Quality checking has already been submitted',
          code: 400
        };
      }

      // Delete Old Defects
      await TNgTicketQuality.destroy({
        where: {
          ng_ticket_id: materialReceivingItemLabel.ng_ticket.id
        },
        force: true,
        transaction: t
      });

      // Create New Defects
      const ngQualities = value.defects.map(
        (item) => ({
          ng_ticket_id: materialReceivingItemLabel.ng_ticket.id,
          defect_id: item.defect_id,
          image: item.image || null
        })
      );

      await TNgTicketQuality.bulkCreate(
        ngQualities,
        {
          transaction: t
        }
      );

      await t.commit();

      return {
        status: true,
        message: 'Quality defect has been updated successfully'
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

  async submitQualityChecking(req) {
    const t = await db.sequelize.transaction();
    try {
      const { mdo_detail_id } = req.params;

      const materialReceivingItem = await TMaterialReceivingItem.findOne({
        where: {
          mdo_detail_id
        },
        attributes: ['id', 'mr_id', 'quality_checked', 'quality_checked_at'],
        include: [
          {
            model: TMaterialReceivingItemLabel,
            as: 'labels',
            attributes: ['id', 'is_quantity', 'is_quality', 'quality_checked_at'],
            include: [
              {
                model: TPartLabels,
                as: 'label',
                attributes: ['id', 'label_number']
              },
              {
                model: TNgTicket,
                as: 'ng_ticket',
                required: false,
                attributes: ['id']
              }
            ]
          },
          {
            model: TMaterialDeliveryOrderDetail,
            as: 'mdo_detail',
            attributes: ['id'],
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['id'],
                include: [
                  {
                    model: SPackages,
                    as: 'package',
                    attributes: ['capacity']
                  }
                ]
              }
            ]
          }
        ],
        transaction: t
      });

      if (!materialReceivingItem) {
        await t.rollback();
        return {
          status: false,
          message: 'Material Receiving Item not found',
          code: 404
        };
      }

      if (materialReceivingItem.quality_checked_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Quality checking has already been submitted',
          code: 400
        };
      }

      const uncheckedLabels = (materialReceivingItem.labels || [])
        .filter(
          (item) =>
            item.is_quantity === true &&
            item.quality_checked_at === null
        );

      // Auto-mark unchecked labels as OK (default OK jika tidak diperiksa)
      for (const item of uncheckedLabels) {
        const checkedAt = new Date();
        await item.update(
          {
            is_quality: true,
            quality_checked_at: checkedAt,
            quality_checked_by: req.user.id
          },
          {
            transaction: t
          }
        );
      }

      const submittedAt = new Date();

      await materialReceivingItem.update(
        {
          quality_checked: true,
          quality_checked_at: submittedAt
        },
        {
          transaction: t
        }
      );

      await this.updateMdoStatus(materialReceivingItem.mr_id, t);

      await t.commit();

      return {
        status: true,
        message: 'Quality checking has been submitted successfully',
        data: {
          id: materialReceivingItem.id,
          quality_checked: true,
          quality_checked_at: submittedAt,
          auto_ok_count: uncheckedLabels.length
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

  async printLabel(req, res) {
    try {
      const { mdo_detail_id } = req.params;

      const item = await TMaterialReceivingItem.findOne({
        where: { mdo_detail_id },
        attributes: ['id'],
        include:[
          {
            model: TMaterialReceiving,
            as: 'material_receiving',
            attributes: ['id'],
            include: [
              {
                model: SMaterialDeliveryOrder,
                as: 'mdo',
                attributes: ['number']
              }
            ]
          },
          {
            model: TMaterialReceivingItemLabel,
            as: 'labels',
            attributes: ['id'],
            include: [
              {
                model: TPartLabels,
                as: 'label',
                attributes: ['label_number'],
                include: [
                  {
                    model: SParts,
                    as: 'part',
                    attributes: ['part_number', 'part_name'],
                    include: [
                      {
                        model: SSuppliers,
                        as: 'supplier',
                        attributes: ['name']
                      },
                      {
                        model: SPackages,
                        as: 'package',
                        attributes: ['capacity']
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!item) {
        return res.status(404).json({
          status: false,
          message: 'Material Receiving Item not found'
        });
      }

      if (!item.labels || item.labels.length === 0) {
        return res.status(400).json({
          status: false,
          message: 'No labels found'
        });
      }

      const materialReceiving = item.material_receiving;
      const mdo = materialReceiving?.mdo;

      const part = item.labels[0]?.label?.part;

      if (!part) {
        return res.status(400).json({
          status: false,
          message: 'Part not found'
        });
      }

      const printedAt = dayjs().format('DD/MM/YYYY HH:mm:ss');

      const fonts = {
        Roboto: {
          normal: path.resolve('fonts/Roboto-Regular.ttf'),
          bold: path.resolve('fonts/Roboto-Medium.ttf'),
          bolditalics: path.resolve('fonts/Roboto-MediumItalic.ttf')
        }
      };

      const printer = new PdfPrinter(fonts);

      const labelItems = [];

      for (const labelData of item.labels) {
        const label = labelData.label;
        if (!label) continue;

        labelItems.push({
          unbreakable: true,
          border: [1, 1, 1, 1],
          borderColor: '#000000',
          borderWidth: [1, 1, 1, 1],
          stack: [
            // Header with company branding
            {
              canvas: [
                {
                  type: 'rect',
                  x: 0,
                  y: 0,
                  w: 280,
                  h: 35,
                  color: '#ffffff'
                }
              ]
            },
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    {
                      text: 'WAREHOUSE',
                      style: 'companyHeader',
                      color: '#1a237e'
                    },
                    {
                      text: 'LABEL PART',
                      style: 'companySubHeader',
                      color: '#1a237e'
                    }
                  ]
                },
                {
                  width: 'auto',
                  qr: label.label_number,
                  fit: 50,
                  alignment: 'right',
                  margin: [0, 2, 0, 0]
                }
              ],
              margin: [6, -32, 6, 8]
            },
            // Label number prominent
            {
              text: label.label_number,
              style: 'labelNumber',
              alignment: 'center',
              margin: [6, 0, 6, 6]
            },
            // Main info table with better styling
            {
              table: {
                widths: ['40%', '*'],
                body: [
                  [
                    { text: 'MDO Number', style: 'tableLabel', fillColor: '#e8eaf6' },
                    { text: mdo.number, style: 'tableValue' }
                  ],
                  [
                    { text: 'Part Number', style: 'tableLabel', fillColor: '#e8eaf6' },
                    { text: part.part_number, style: 'tableValueHighlight' }
                  ],
                  [
                    { text: 'Part Name', style: 'tableLabel', fillColor: '#e8eaf6' },
                    { text: part.part_name, style: 'tableValue' }
                  ],
                  [
                    { text: 'Supplier', style: 'tableLabel', fillColor: '#e8eaf6' },
                    { text: part.supplier?.name || '-', style: 'tableValue' }
                  ],
                  [
                    { text: 'Qty per Kanban', style: 'tableLabel', fillColor: '#e8eaf6' },
                    { text: part.package?.capacity || '-', style: 'tableValueHighlight' }
                  ]
                ]
              },
              layout: {
                hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
                vLineWidth: () => 0,
                hLineColor: () => '#c5cae9',
                paddingTop: () => 6,
                paddingBottom: () => 6,
                paddingLeft: () => 8,
                paddingRight: () => 8
              },
              margin: [6, 0, 6, 6]
            },
            // Footer
            {
              columns: [
                {
                  width: '*',
                  text: 'Printed: ' + printedAt,
                  style: 'footer',
                  alignment: 'left'
                },
                {
                  width: 'auto',
                  text: 'OSW v1.0',
                  style: 'footer',
                  alignment: 'right'
                }
              ],
              margin: [6, 2, 6, 6]
            }
          ]
        });
      }

      const tableBody = [];

      for (let i = 0; i < labelItems.length; i += 2) {
        tableBody.push([
          {
            margin: [6, 6, 6, 6],
            ...labelItems[i],
            height: 220,
            border: [true, true, true, true],
            borderColor: [
              '#000000',
              '#000000',
              '#000000',
              '#000000'
            ]
          },
          labelItems[i + 1]
            ? {
                margin: [6, 6, 6, 6],
                ...labelItems[i + 1],
                height: 220
              }
            : { text: '', height: 220 }
        ]);
      }

      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [12, 12, 12, 12],
        content: [
          {
            table: {
              widths: ['50%', '50%'],
              body: tableBody,
              dontBreakRows: true
            },
            layout: {
              hLineWidth: (i, node) => 1,
              vLineWidth: (i, node) => 1,
              hLineColor: () => '#000000',
              vLineColor: () => '#000000',
              paddingTop: () => 0,
              paddingBottom: () => 0,
              paddingLeft: () => 0,
              paddingRight: () => 0
            }
          }
        ],
        styles: {
          companyHeader: { fontSize: 16, bold: true, italics: true },
          companySubHeader: { fontSize: 10, bold: false },
          labelNumber: { fontSize: 11, bold: true, color: '#1a237e' },
          tableLabel: { fontSize: 9, bold: true, color: '#303f9f' },
          tableValue: { fontSize: 9, color: '#212121' },
          tableValueHighlight: { fontSize: 9, bold: true, color: '#1a237e' },
          footer: { fontSize: 7, color: '#9e9e9e' }
        },
        defaultStyle: {
          font: 'Roboto'
        }
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename=mdo-label-${part.part_number}.pdf`
      );

      pdfDoc.pipe(res);
      pdfDoc.end();

      return;

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        status: false,
        message: 'Internal server error'
      });
    }
  }

  async dropdown(req, res) {
    try {
      const rows = await TMaterialReceiving.findAll({
        attributes: ['id'],
        where: {
          status_id: 5 // Good Receipt
        },
        include: [
          {
            model: SMaterialDeliveryOrder,
            as: 'mdo',
            attributes: ['id', 'number'],
            required: true,
            include: [
              {
                model: SMaterialPurchaseOrder,
                as: 'mpo',
                attributes: ['id'],
                include: [
                  {
                    model: SSuppliers,
                    as: 'supplier',
                    attributes: ['id', 'name']
                  }
                ]
              }
            ]
          }
        ],
        order: [['id', 'DESC']]
      })

      const formatted = rows.map(row => ({
        id: row.id,
        number: row.mdo?.number || '-',
        supplier_name: row.mdo?.mpo?.supplier?.name || '-'
      }))

      return {
        status: true,
        data: formatted
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

  async getDropdownMaterialReceivingStatus() {
    try {
      const statuses = await RefReceivingStatus.findAll({
        attributes: ['id', 'name'],
        order: [['id', 'ASC']]
      });

      return {
        status: true,
        data: statuses
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

export default new MaterialReceivingModule();