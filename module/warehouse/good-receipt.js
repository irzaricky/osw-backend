import { Op } from 'sequelize';
import Joi from 'joi';
import PdfPrinter from 'pdfmake/src/printer.js';
import path from 'path';
import dayjs from 'dayjs';
import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import helper from '../../class/helper.class.js';
import BaseModule from "../../class/base.module.js";

const {
  SParts,
  SPackages,
  SUsers,
  SRoles,
  SUserDetail,
  SSuppliers,
  SDefects,
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
            attributes: ['id', 'quantity_checked_at', 'quality_checked_at'],
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
                        attributes: ['expected_qty', 'actual_qty']
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
            .sort(
              (a, b) =>
                new Date(
                  b.quantity_checked_at
                ) -
                new Date(
                  a.quantity_checked_at
                )
            )
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
            .sort(
              (a, b) =>
                new Date(
                  b.quality_checked_at
                ) -
                new Date(
                  a.quality_checked_at
                )
            )
            .map((label) => ({
              id: label.id,
              label_number: label.label?.label_number || null,
              judgement: label.is_quality === true ? 'OK' : 'NG',
              defects: (label.ng_ticket?.qualities || []).map(
                (quality) => ({
                  id: quality.id,
                  defect_id: quality.defect?.id || null,
                  defect_name: quality.defect?.name || null,
                  image: quality.image ? `${process.env.SITE_URL}${quality.image}` : null
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

  async downloadReport(req, res) {
    try {
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
              }
            ]
          },
          {
            model: TMaterialReceivingItem,
            as: 'items',
            required: false,
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
                attributes: ['id', 'is_quantity', 'is_quality'],
                include: [
                  {
                    model: TPartLabels,
                    as: 'label',
                    attributes: ['label_number']
                  }
                ]
              }
            ]
          },
          {
            model: TGoodReceipt,
            as: 'good_receipt',
            attributes: ['id', 'approved_at', 'remarks'],
            include: [
              {
                model: SUsers,
                as: 'approver',
                attributes: ['id'],
                include: [
                  {
                    model: SRoles,
                    as: 'role',
                    attributes: ['name']
                  },
                  {
                    model: SUserDetail,
                    as: 'user_detail',
                    attributes: ['full_name']
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!materialReceiving) {
        return res.status(404).json({
          status: false,
          message: 'Material receiving not found',
          code: 404
        });
      }

      if (!materialReceiving.good_receipt) {
        return res.status(400).json({
          status: false,
          message: 'Good Receipt is not approved yet',
          code: 400
        });
      }

      const approvedBy = materialReceiving.good_receipt.approver?.user_detail?.full_name ||
        materialReceiving.good_receipt.approver?.username ||
        'Unknown';
      const approverRole = materialReceiving.good_receipt.approver?.role?.name || '';
      const approvedAt = materialReceiving.good_receipt.approved_at
        ? new Date(materialReceiving.good_receipt.approved_at).toLocaleString('en-US', { hour12: false })
        : '-';
      const receivedAt = materialReceiving.received_at
        ? new Date(materialReceiving.received_at).toLocaleString('en-US', { hour12: false })
        : '-';
      const printedAt = new Date().toLocaleString('en-US', { hour12: false });

      const items = materialReceiving.items || [];
      const partRows = items.map((item, index) => {
        const labels = item.labels || [];
        const expected = labels.length;
        const accepted = labels.filter(label => label.is_quantity === true && label.is_quality === true).length;
        const rejected = expected - accepted;
        const partName = item.mdo_detail?.part?.part_name || '-';
        const partNumber = item.mdo_detail?.part?.part_number || '-';

        return {
          no: index + 1,
          partNumber,
          partName,
          expected,
          accepted,
          rejected
        };
      });

      const totalExpected = partRows.reduce((sum, row) => sum + row.expected, 0);
      const totalAccepted = partRows.reduce((sum, row) => sum + row.accepted, 0);
      const totalRejected = partRows.reduce((sum, row) => sum + row.rejected, 0);

      const fonts = {
        Roboto: {
          normal: path.resolve('fonts/Roboto-Regular.ttf'),
          bold: path.resolve('fonts/Roboto-Medium.ttf'),
          italics: path.resolve('fonts/Roboto-Italic.ttf'),
          bolditalics: path.resolve('fonts/Roboto-MediumItalic.ttf')
        }
      };

      const printer = new PdfPrinter(fonts);

      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [36, 36, 36, 36],
        content: [
          // Header company details
          {
            columns: [
              {
                width: '*',
                stack: [
                  { text: 'PT. OWS LOGISTICS & DISTRIBUTION', style: 'companyName' },
                  { text: 'Kawasan Industri Cikarang Blok B-12, Bekasi, Jawa Barat', style: 'companyAddress' },
                  { text: 'Phone: (021) 8900-1234 | Email: dispatch@ows.co.id', style: 'companyAddress' }
                ]
              },
              {
                width: 'auto',
                stack: [
                  { text: 'GOOD RECEIPT REPORT', style: 'docTitle', alignment: 'right' },
                  { text: 'WAREHOUSE DOCUMENT', style: 'docSubTitle', alignment: 'right' }
                ]
              }
            ],
            margin: [0, 0, 0, 15]
          },
          // Divider Line
          {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 1.5, lineColor: '#1a237e' }],
            margin: [0, 0, 0, 15]
          },
          // Metadata grid
          {
            columns: [
              {
                width: '50%',
                table: {
                  widths: ['35%', '*'],
                  body: [
                    [{ text: 'PO Number', style: 'metaLabel' }, { text: `: ${materialReceiving.mdo?.mpo?.number || '-'}`, style: 'metaValue' }],
                    [{ text: 'DO Number', style: 'metaLabel' }, { text: `: ${materialReceiving.mdo?.number || '-'}`, style: 'metaValueBold' }],
                    [{ text: 'Arrived At', style: 'metaLabel' }, { text: `: ${receivedAt}`, style: 'metaValue' }],
                    [{ text: 'Warehouse', style: 'metaLabel' }, { text: `: ${materialReceiving.mdo?.mpo?.warehouse?.name || '-'}`, style: 'metaValue' }]
                  ]
                },
                layout: 'noBorders'
              },
              {
                width: '50%',
                table: {
                  widths: ['30%', '*'],
                  body: [
                    [{ text: 'Supplier', style: 'metaLabel' }, { text: `: ${materialReceiving.mdo?.mpo?.supplier?.name || '-'}`, style: 'metaValueBold' }],
                    [{ text: 'Status', style: 'metaLabel' }, { text: `: ${materialReceiving.status?.name || '-'}`, style: 'metaValue' }],
                    [{ text: 'Approved At', style: 'metaLabel' }, { text: `: ${approvedAt}`, style: 'metaValue' }]
                  ]
                },
                layout: 'noBorders'
              }
            ],
            margin: [0, 0, 0, 20]
          },
          // Summary Cards
          {
            columns: [
              {
                width: '33%',
                stack: [
                  { text: 'Total Parts', style: 'summaryLabel' },
                  { text: String(partRows.length), style: 'summaryValue' }
                ],
                margin: [0, 0, 8, 0],
                style: 'summaryCard'
              },
              {
                width: '33%',
                stack: [
                  { text: 'Accepted Labels', style: 'summaryLabel' },
                  { text: String(totalAccepted), style: 'summaryValue' }
                ],
                margin: [0, 0, 8, 0],
                style: 'summaryCard'
              },
              {
                width: '34%',
                stack: [
                  { text: 'Rejected Labels', style: 'summaryLabel' },
                  { text: String(totalRejected), style: 'summaryValue' }
                ],
                style: 'summaryCard'
              }
            ],
            columnGap: 8,
            margin: [0, 0, 0, 20]
          },
          // Section Title
          { text: 'RECEIVED ITEMS LIST', style: 'sectionTitle', margin: [0, 0, 0, 8] },
          {
            table: {
              headerRows: 1,
              widths: ['7%', '20%', '28%', '15%', '15%', '15%'],
              body: [
                [
                  { text: 'No', style: 'tableHeader', alignment: 'center' },
                  { text: 'Part Number', style: 'tableHeader', alignment: 'center' },
                  { text: 'Part Name', style: 'tableHeader', alignment: 'center' },
                  { text: 'Expected (labels)', style: 'tableHeader', alignment: 'center' },
                  { text: 'Accepted (labels)', style: 'tableHeader', alignment: 'center' },
                  { text: 'Rejected (labels)', style: 'tableHeader', alignment: 'center' }
                ],
                ...partRows.map((row, rowIndex) => [
                  { text: String(row.no), style: 'tableCell', alignment: 'center' },
                  { text: row.partNumber, style: 'tableCellHighlight' },
                  { text: row.partName, style: 'tableCell' },
                  { text: String(row.expected), style: 'tableCell', alignment: 'center' },
                  { text: String(row.accepted), style: 'tableCell', alignment: 'center' },
                  { text: String(row.rejected), style: 'tableCell', alignment: 'center' }
                ]),
                [
                  { text: 'TOTAL', colSpan: 3, style: 'tableHeader', alignment: 'left' },
                  {},
                  {},
                  { text: String(totalExpected), style: 'tableHeader', alignment: 'center' },
                  { text: String(totalAccepted), style: 'tableHeader', alignment: 'center' },
                  { text: String(totalRejected), style: 'tableHeader', alignment: 'center' }
                ]
              ]
            },
            layout: {
              hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
              vLineWidth: () => 0,
              hLineColor: (i, node) => (i === 0 || i === node.table.body.length) ? '#1a237e' : '#e0e0e0',
              paddingTop: () => 6,
              paddingBottom: () => 6,
              paddingLeft: () => 8,
              paddingRight: () => 8
            },
            margin: [0, 0, 0, 30]
          },
          // Remarks Section
          { text: 'REMARKS', style: 'sectionTitle', margin: [0, 0, 0, 8] },
          {
            text: materialReceiving.good_receipt.remarks || '-',
            style: 'remarksText',
            fillColor: '#fafafa',
            margin: [8, 8, 8, 8],
            border: [1, 1, 1, 1],
            borderColor: '#e0e0e0'
          },
          // Signatures block
          {
            columns: [
              {
                width: '50%',
                text: ''
              },
              {
                width: '50%',
                stack: [
                  { text: 'Approved By,', style: 'sigLabel', alignment: 'center' },
                  { text: '', margin: [0, 35, 0, 0] },
                  { text: `( ${approvedBy} )`, style: 'sigName', alignment: 'center' },
                  { text: approverRole, style: 'sigRole', alignment: 'center' }
                ]
              }
            ],
            margin: [0, 30, 0, 0]
          }
        ],
        footer: (currentPage, pageCount) => {
          return {
            columns: [
              { text: `Printed: ${printedAt}`, style: 'footerLeft', margin: [36, 0, 0, 0] },
              { text: `Page ${currentPage} of ${pageCount}`, style: 'footerRight', alignment: 'right', margin: [0, 0, 36, 0] }
            ],
            style: 'footer'
          };
        },
        styles: {
          companyName: { fontSize: 13, bold: true, color: '#1a237e' },
          companyAddress: { fontSize: 8, color: '#616161', margin: [0, 2, 0, 0] },
          docTitle: { fontSize: 18, bold: true, color: '#1a237e' },
          docSubTitle: { fontSize: 10, bold: true, color: '#757575', margin: [0, 2, 0, 0] },
          metaLabel: { fontSize: 9, bold: true, color: '#424242' },
          metaValue: { fontSize: 9, color: '#212121' },
          metaValueBold: { fontSize: 9, bold: true, color: '#1a237e' },
          sectionTitle: { fontSize: 10, bold: true, color: '#1a237e', tracking: 1 },
          summaryCard: { fillColor: '#f5f5f5', margin: [0, 0, 0, 0], padding: [10, 10, 10, 10] },
          summaryLabel: { fontSize: 9, bold: true, color: '#424242' },
          summaryValue: { fontSize: 16, bold: true, color: '#1a237e', margin: [0, 6, 0, 0] },
          tableHeader: { fontSize: 9, bold: true, color: '#ffffff', fillColor: '#1a237e', margin: [0, 2, 0, 2] },
          tableCell: { fontSize: 9, color: '#212121' },
          tableCellHighlight: { fontSize: 9, bold: true, color: '#1a237e' },
          remarksText: { fontSize: 9, color: '#212121' },
          sigLabel: { fontSize: 9, bold: true, color: '#424242' },
          sigName: { fontSize: 9, bold: true, color: '#212121' },
          sigRole: { fontSize: 8, color: '#616161', margin: [0, 2, 0, 0] },
          footer: { fontSize: 7, color: '#9e9e9e' },
          footerLeft: { fontSize: 7, color: '#9e9e9e' },
          footerRight: { fontSize: 7, color: '#9e9e9e' }
        },
        defaultStyle: {
          font: 'Roboto'
        }
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=good-receipt-${mr_id}.pdf`);
      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (error) {
      if (!res.headersSent) {
        return res.status(500).json({
          status: false,
          error: error.message,
          code: 500
        });
      }
      res.end();
    }
  }
}

export default new GoodReceiptModule();