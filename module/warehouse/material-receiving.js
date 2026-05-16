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
  SWarehouses,
  SDocks,
  SMaterialPurchaseOrder,
  SMaterialDeliveryOrder,
  TMaterialDeliveryOrderDetail,
  RefReceivingStatus,
  TMaterialReceiving,
  TMaterialReceivingItem,
  TMaterialReceivingItemLabel,
  TPartLabels
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