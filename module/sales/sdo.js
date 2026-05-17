import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import PdfPrinter from 'pdfmake/src/printer.js';
import Joi from 'joi';
import dayjs from 'dayjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  SDeliveryOrders, SDeliveryOrderDetails,
  SDeliveryPlans, SDeliveryPlanDetails,
  SSalesPurchaseOrders, SSalesPurchaseOrderDetails,
  SVehicles, SCustomers, SParts, SUsers, SUserDetail
} = db;

class SDOModule extends BaseModule {
  async getDropdownVehicles(req) {
    try {
      const data = await SVehicles.findAll({
        attributes: ['id', ['plate_number', 'license_plate'], 'vehicle_type_id'],
        order: [['plate_number', 'ASC']]
      });
      return { status: true, data };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async getDropdownDrivers(req) {
    try {
      const data = await SUserDetail.findAll({
        attributes: ['user_id', 'full_name', 'employee_number'],
        include: [{ model: SUsers, as: 'user', attributes: ['id', 'email'] }],
        order: [['full_name', 'ASC']]
      });
      return { status: true, data };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async list(req) {
    try {
      const params = req.query;
      const { delivery_status, search, start_date, end_date } = params;
      const { limit, page, offset } = helper.getPagination(params);

      const where = {};
      if (delivery_status) where.delivery_status = delivery_status;
      if (start_date && end_date) {
        where.shipment_date = { [Op.between]: [start_date, end_date] };
      }
      if (search) {
        where[Op.or] = [
          { do_number: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const include = [
        { model: SCustomers, as: 'customer', attributes: ['id', 'name', 'customer_code'] },
        { model: SVehicles, as: 'vehicle', attributes: ['id', ['plate_number', 'license_plate']] },
        { model: SUserDetail, as: 'driver', attributes: ['user_id', 'full_name'] },
        { model: SDeliveryPlans, as: 'deliveryPlan', attributes: ['id', 'dp_number', 'scheduled_date'] },
        {
          model: SUsers, as: 'creator', attributes: ['id', 'email'],
          include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
        }
      ];

      const { count, rows } = await SDeliveryOrders.findAndCountAll({
        where, include, limit, offset,
        order: [['created_at', 'DESC']],
        distinct: true
      });

      return { status: true, data: helper.getPaginationData(rows, count, page, limit) };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async detail(req) {
    try {
      const { id } = req.params;
      const sdo = await SDeliveryOrders.findByPk(id, {
        include: [
          { model: SCustomers, as: 'customer', attributes: ['id', 'name', 'customer_code'] },
          { model: SVehicles, as: 'vehicle', attributes: ['id', ['plate_number', 'license_plate']] },
          { model: SUserDetail, as: 'driver', attributes: ['user_id', 'full_name'] },
          { model: SDeliveryPlans, as: 'deliveryPlan', attributes: ['id', 'dp_number', 'scheduled_date', 'destination'] },
          {
            model: SUsers, as: 'creator', attributes: ['id', 'email'],
            include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
          },
          {
            model: SDeliveryOrderDetails, as: 'details',
            include: [
              {
                model: SDeliveryPlanDetails, as: 'planDetail',
                include: [
                  {
                    model: SSalesPurchaseOrderDetails, as: 'spoDetail',
                    include: [{ model: SParts, as: 'part', attributes: ['id', 'part_number', 'part_name'] }]
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!sdo) return { status: false, message: 'Delivery Order not found', code: 404 };
      return { status: true, data: sdo };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async _generateDONumber(transaction) {
    const prefix = `SDO-${dayjs().format('YYYY-MM')}`;
    const last = await SDeliveryOrders.findOne({
      where: { do_number: { [Op.like]: `${prefix}-%` } },
      order: [['do_number', 'DESC']],
      transaction, paranoid: false
    });
    let seq = 1;
    if (last) {
      const parts = last.do_number.split('-');
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n)) seq = n + 1;
    }
    return `${prefix}-${seq.toString().padStart(3, '0')}`;
  }

  async create(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;
      const currentUser = req.user;

      const schema = Joi.object({
        delivery_plan_id: Joi.number().integer().required(),
        vehicle_id: Joi.number().integer().required(),
        driver_id: Joi.number().integer().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) { await t.rollback(); return validation; }

      const { delivery_plan_id, vehicle_id, driver_id } = validation.value;

      // Load SDP with all details + SPO chain to get customer_id
      const sdp = await SDeliveryPlans.findByPk(delivery_plan_id, {
        include: [
          {
            model: SDeliveryPlanDetails, as: 'details',
            include: [
              {
                model: SSalesPurchaseOrderDetails, as: 'spoDetail',
                include: [{ model: SSalesPurchaseOrders, as: 'order', attributes: ['id', 'customer_id'] }]
              }
            ]
          }
        ],
        transaction: t
      });

      if (!sdp) { await t.rollback(); return { status: false, message: 'Delivery Plan not found', code: 404 }; }

      if (!['Draft', 'Scheduled'].includes(sdp.status)) {
        await t.rollback();
        return { status: false, message: `Delivery Plan status "${sdp.status}" cannot be executed into a Delivery Order`, code: 400 };
      }

      if (!sdp.details || sdp.details.length === 0) {
        await t.rollback();
        return { status: false, message: 'Delivery Plan has no detail items', code: 400 };
      }

      // Check vehicle exists
      const vehicle = await SVehicles.findByPk(vehicle_id, { transaction: t });
      if (!vehicle) { await t.rollback(); return { status: false, message: 'Vehicle not found', code: 404 }; }

      // Check driver exists (driver_id references s_users_details.user_id)
      const driver = await SUserDetail.findOne({ where: { user_id: driver_id }, transaction: t });
      if (!driver) { await t.rollback(); return { status: false, message: 'Driver not found', code: 404 }; }

      // Extract customer_id from the first detail's SPO
      const customer_id = sdp.details[0]?.spoDetail?.order?.customer_id;
      if (!customer_id) {
        await t.rollback();
        return { status: false, message: 'Could not determine customer from Delivery Plan details', code: 400 };
      }

      const do_number = await this._generateDONumber(t);

      const sdo = await SDeliveryOrders.create({
        do_number,
        delivery_plan_id: sdp.id,
        customer_id,
        vehicle_id,
        driver_id,
        shipment_date: dayjs().format('YYYY-MM-DD'),
        delivery_status: 'In Transit',
        created_by: currentUser.id
      }, { transaction: t });

      // Copy SDP details → SDO details (sent_qty = planned_qty)
      const sdoDetailRecords = sdp.details.map(planDetail => ({
        delivery_order_id: sdo.id,
        delivery_plan_detail_id: planDetail.id,
        sent_qty: planDetail.planned_qty,
        received_qty: null,
        notes: null
      }));
      await SDeliveryOrderDetails.bulkCreate(sdoDetailRecords, { transaction: t });

      // Update SDP status → Scheduled
      await sdp.update({ status: 'Scheduled' }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'CREATE_SDO',
        resourceId: sdo.id,
        newData: sdo,
        description: `Created Delivery Order ${do_number} from plan ${sdp.dp_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'Delivery Order created successfully', data: sdo };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ─── UPDATE STATUS (In Transit → Delivered + POD) ────────────────────────

  async updateStatus(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;

      const sdo = await SDeliveryOrders.findByPk(id, {
        include: [{ model: SDeliveryPlans, as: 'deliveryPlan', attributes: ['id', 'dp_number'] }],
        transaction: t
      });
      if (!sdo) { await t.rollback(); return { status: false, message: 'Delivery Order not found', code: 404 }; }

      if (sdo.delivery_status !== 'In Transit') {
        await t.rollback();
        return { status: false, message: 'Only "In Transit" Delivery Orders can be confirmed as Delivered', code: 400 };
      }

      // Parse details if it is stringified JSON (from multipart/form-data)
      if (typeof req.body.details === 'string') {
        try {
          req.body.details = JSON.parse(req.body.details);
        } catch (e) {
          // ignore
        }
      }

      // Validate and parse details from body
      const detailSchema = Joi.object({
        delivery_order_detail_id: Joi.number().integer().required(),
        received_qty: Joi.number().integer().min(0).required(),
        notes: Joi.string().allow('', null).optional()
      });

      const schema = Joi.object({
        notes: Joi.string().allow('', null).optional(),
        details: Joi.array().items(detailSchema).min(1).required()
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) { await t.rollback(); return validation; }

      const { notes, details } = validation.value;

      // Handle proof_of_delivery file upload
      let proofUrl = null;
      if (req.files && req.files.proof_of_delivery) {
        const file = req.files.proof_of_delivery;
        const ext = path.extname(file.name);
        const fileName = `${sdo.do_number.replace(/\//g, '-')}_${Date.now()}${ext}`;
        const uploadDir = path.join(__dirname, '../../public/uploads/pod');

        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const uploadPath = path.join(uploadDir, fileName);
        await file.mv(uploadPath);

        proofUrl = `/uploads/pod/${fileName}`;
      }

      // Update each detail's received_qty and notes
      for (const item of details) {
        const doDetail = await SDeliveryOrderDetails.findOne({
          where: { id: item.delivery_order_detail_id, delivery_order_id: sdo.id },
          transaction: t
        });

        if (!doDetail) {
          await t.rollback();
          return {
            status: false,
            message: `Delivery Order Detail ID ${item.delivery_order_detail_id} not found or does not belong to this SDO`,
            code: 404
          };
        }

        await doDetail.update({
          received_qty: item.received_qty,
          notes: item.notes ?? doDetail.notes
        }, { transaction: t });
      }

      const oldData = JSON.parse(JSON.stringify(sdo));

      // Update SDO header
      await sdo.update({
        delivery_status: 'Delivered',
        notes: notes ?? sdo.notes,
        proof_of_delivery: proofUrl ?? sdo.proof_of_delivery,
        received_at: new Date()
      }, { transaction: t });

      // Check if all SDOs for this SDP are Delivered → mark SDP as Shipped
      const pendingSDOs = await SDeliveryOrders.count({
        where: {
          delivery_plan_id: sdo.delivery_plan_id,
          delivery_status: { [Op.ne]: 'Delivered' }
        },
        transaction: t
      });

      if (pendingSDOs === 0 && sdo.deliveryPlan) {
        await SDeliveryPlans.update(
          { status: 'Shipped' },
          { where: { id: sdo.delivery_plan_id }, transaction: t }
        );
      }

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'DELIVER_SDO',
        resourceId: sdo.id,
        oldData,
        newData: sdo,
        description: `Delivery Order ${sdo.do_number} marked as Delivered`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'Delivery Order confirmed as Delivered successfully' };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  // ─── GENERATE SURAT JALAN PDF (Print Delivery Order) ─────────────────────

  async printSuratJalan(req, res) {
    try {
      const { id } = req.params;

      const sdo = await SDeliveryOrders.findByPk(id, {
        include: [
          { model: SCustomers, as: 'customer', attributes: ['id', 'name', 'customer_code'] },
          { model: SVehicles, as: 'vehicle', attributes: ['id', ['plate_number', 'license_plate']] },
          { model: SUserDetail, as: 'driver', attributes: ['user_id', 'full_name'] },
          { model: SDeliveryPlans, as: 'deliveryPlan', attributes: ['id', 'dp_number', 'scheduled_date', 'destination'] },
          {
            model: SUsers, as: 'creator', attributes: ['id', 'email'],
            include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
          },
          {
            model: SDeliveryOrderDetails, as: 'details',
            include: [
              {
                model: SDeliveryPlanDetails, as: 'planDetail',
                include: [
                  {
                    model: SSalesPurchaseOrderDetails, as: 'spoDetail',
                    include: [
                      { model: SParts, as: 'part', attributes: ['id', 'part_number', 'part_name'] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!sdo) {
        return res.status(404).json({
          status: false,
          message: 'Delivery Order not found'
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

      // Build items table body
      const tableBody = [
        [
          { text: 'No.', style: 'tableHeader', alignment: 'center' },
          { text: 'Part Number', style: 'tableHeader' },
          { text: 'Part Name', style: 'tableHeader' },
          { text: 'Sent Qty', style: 'tableHeader', alignment: 'right' },
          { text: 'Received Qty', style: 'tableHeader', alignment: 'center' },
          { text: 'Notes', style: 'tableHeader' }
        ]
      ];

      if (sdo.details && sdo.details.length > 0) {
        sdo.details.forEach((item, index) => {
          const part = item.planDetail?.spoDetail?.part;
          tableBody.push([
            { text: String(index + 1), alignment: 'center', style: 'tableCell' },
            { text: part?.part_number || '-', style: 'tableCellHighlight' },
            { text: part?.part_name || '-', style: 'tableCell' },
            { text: `${item.sent_qty} pcs`, alignment: 'right', style: 'tableCellHighlight' },
            { text: '', alignment: 'center', style: 'tableCell' }, // Left blank for physical signing/recording
            { text: item.notes || '', style: 'tableCell' }
          ]);
        });
      } else {
        tableBody.push([
          { text: 'No items found in this Delivery Order', colSpan: 6, alignment: 'center', style: 'tableCell' },
          {}, {}, {}, {}, {}
        ]);
      }

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
                  { text: 'SURAT JALAN', style: 'docTitle', alignment: 'right' },
                  { text: 'DELIVERY ORDER', style: 'docSubTitle', alignment: 'right' }
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
                    [{ text: 'DO Number', style: 'metaLabel' }, { text: `: ${sdo.do_number}`, style: 'metaValueBold' }],
                    [{ text: 'Date', style: 'metaLabel' }, { text: `: ${dayjs(sdo.shipment_date).format('DD MMMM YYYY')}`, style: 'metaValue' }],
                    [{ text: 'Plan Ref', style: 'metaLabel' }, { text: `: ${sdo.deliveryPlan?.dp_number || '-'}`, style: 'metaValue' }],
                    [{ text: 'Driver', style: 'metaLabel' }, { text: `: ${sdo.driver?.full_name || '-'}`, style: 'metaValue' }],
                    [{ text: 'Vehicle Plate', style: 'metaLabel' }, { text: `: ${sdo.vehicle?.license_plate || '-'}`, style: 'metaValueBold' }]
                  ]
                },
                layout: 'noBorders'
              },
              {
                width: '50%',
                table: {
                  widths: ['30%', '*'],
                  body: [
                    [{ text: 'Deliver To', style: 'metaLabel' }, { text: `: ${sdo.customer?.name || '-'}`, style: 'metaValueBold' }],
                    [{ text: 'Cust Code', style: 'metaLabel' }, { text: `: ${sdo.customer?.customer_code || '-'}`, style: 'metaValue' }],
                    [{ text: 'Address', style: 'metaLabel' }, { text: `: ${sdo.deliveryPlan?.destination || '-'}`, style: 'metaValue' }]
                  ]
                },
                layout: 'noBorders'
              }
            ],
            margin: [0, 0, 0, 20]
          },
          // Table Title
          { text: 'SHIPMENT ITEMS LIST', style: 'sectionTitle', margin: [0, 0, 0, 8] },
          // Items Table
          {
            table: {
              headerRows: 1,
              widths: ['7%', '20%', '35%', '13%', '13%', '12%'],
              body: tableBody
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
          // Signatures block
          {
            columns: [
              {
                width: '33%',
                stack: [
                  { text: 'Prepared By,', style: 'sigLabel', alignment: 'center' },
                  { text: '', margin: [0, 35, 0, 0] },
                  { text: '( Logistics Staff )', style: 'sigName', alignment: 'center' }
                ]
              },
              {
                width: '34%',
                stack: [
                  { text: 'Driver,', style: 'sigLabel', alignment: 'center' },
                  { text: '', margin: [0, 35, 0, 0] },
                  { text: `( ${sdo.driver?.full_name || '___________'} )`, style: 'sigName', alignment: 'center' }
                ]
              },
              {
                width: '33%',
                stack: [
                  { text: 'Received By,', style: 'sigLabel', alignment: 'center' },
                  { text: '', margin: [0, 35, 0, 0] },
                  { text: '( Customer Representative )', style: 'sigName', alignment: 'center' }
                ]
              }
            ]
          }
        ],
        footer: (currentPage, pageCount) => {
          return {
            columns: [
              { text: `Printed: ${printedAt} | Powered by OSW v1.0`, style: 'footerLeft', margin: [36, 0, 0, 0] },
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
          tableHeader: { fontSize: 9, bold: true, color: '#ffffff', fillColor: '#1a237e', margin: [0, 2, 0, 2] },
          tableCell: { fontSize: 9, color: '#212121' },
          tableCellHighlight: { fontSize: 9, bold: true, color: '#1a237e' },
          sigLabel: { fontSize: 9, bold: true, color: '#424242' },
          sigName: { fontSize: 9, bold: true, color: '#212121' },
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
        `inline; filename=Surat-Jalan-${sdo.do_number}.pdf`
      );

      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (error) {
      console.error('Error generating Surat Jalan PDF:', error);
      res.status(500).json({
        status: false,
        message: 'Internal server error while generating PDF'
      });
    }
  }
}

export default new SDOModule();
