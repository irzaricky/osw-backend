import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import PdfPrinter from 'pdfmake/src/printer.js';
import QRCode from 'qrcode';
import dayjs from 'dayjs';
import path from 'path';

const { TWorkOrderStoring, TWorkOrderStoringItem, TWorkOrderStoringItemLabel, RefWorkOrderStoringStatus, RefWorkOrderStoringType, SParts, TPartLabels, SWarehouseAreas, SSuppliers, SUsers, SUserDetail } = db;

class WorkOrderStoringModule extends BaseModule {
  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';
      const wo_status_id = params.wo_status_id;
      const wo_category = params.wo_category;

      const where = {};

      if (search) {
        where.wo_number = { [Op.iLike]: `%${search}%` };
      }

      if (wo_status_id) {
        where.wo_status_id = wo_status_id;
      }

      if (wo_category) {
        where.wo_category = wo_category;
      }

      const include = [
        {
          model: RefWorkOrderStoringStatus,
          as: 'status',
          attributes: ['id', 'name']
        },
        {
          model: RefWorkOrderStoringType,
          as: 'type',
          attributes: ['id', 'name']
        },
        {
          model: SWarehouseAreas,
          as: 'area',
          attributes: ['id', 'name']
        },
        {
          model: SUsers,
          as: 'user',
          attributes: ['id', 'email'],
          include: [
            {
              model: SUserDetail,
              as: 'user_detail',
              attributes: ['full_name']
            }
          ]
        }
      ]

      const { count, rows } = await TWorkOrderStoring.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['wo_status_id', 'wo_type_id', 'deleted_at'] },
        include,
        order: [['created_at', 'DESC']]
      });

      return {
        status: true,
        data: helper.getPaginationData(rows, count, page, limit)
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
    try {
      const id = req.params.id;

      const workOrder = await TWorkOrderStoring.findByPk(id, {
        attributes: { exclude: ['wo_status_id', 'wo_type_id', 'warehouse_area_id', 'created_by', 'deleted_at'] },
        include: [
          {
            model: RefWorkOrderStoringStatus,
            as: 'status',
            attributes: ['id', 'name']
          },
          {
            model: RefWorkOrderStoringType,
            as: 'type',
            attributes: ['id', 'name']
          },
          {
            model: SWarehouseAreas,
            as: 'area',
            attributes: ['id', 'name']
          },
          {
            model: TWorkOrderStoringItem,
            as: 'items',
            attributes: ['id', 'total_kanban'],
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

      if (!workOrder) {
        return {
          status: false,
          message: 'Work Order Storing not found',
          code: 404
        };
      }

      return {
        status: true,
        data: workOrder
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

  async add(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;

      const schema = Joi.object({
        wo_category: Joi.string().valid('Placement', 'Take Out').required(),
        ref_doc_number: Joi.string().allow('', null),
        ref_doc_name: Joi.string().allow('', null),
        wo_date: Joi.date().required(),
        wo_description: Joi.string().allow('', null),
        wo_type_id: Joi.number().integer().required(),
        warehouse_area_id: Joi.number().integer().required(),
        wo_status_id: Joi.number().integer().valid(1, 2).required(),

        items: Joi.array().items(
          Joi.object({
            part_id: Joi.number().integer().required(),
            total_kanban: Joi.number().min(1).required()
          })
        ).min(1).required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { warehouse_area_id, wo_type_id, wo_date } = validation.value;
      const value = validation.value;
    
      try {
        await helper.checkExists(SWarehouseAreas, warehouse_area_id, 'Warehouse Area', t);
        await helper.checkExists(RefWorkOrderStoringType, wo_type_id, 'Work Order Type', t);
      } catch (err) {
        await t.rollback();
        return err;
      }

      const dateStr = dayjs().format('YYMMDD');

      const prefix =
        wo_type_id === 1 ? 'M' :
        wo_type_id === 2 ? 'W' : 'F';

      const woPrefix = `WO-${prefix}-${dateStr}-`;

      const lastWO = await TWorkOrderStoring.findOne({
        where: {
          wo_number: {
            [Op.like]: `${woPrefix}%`
          }
        },
        order: [['wo_number', 'DESC']],
        transaction: t
      });

      let nextNumber = 1;

      if (lastWO) {
        const lastSeq = parseInt(lastWO.wo_number.split('-').pop(), 10);
        nextNumber = lastSeq + 1;
      }

      const wo_number = `${woPrefix}${String(nextNumber).padStart(3, '0')}`;

      const existing = await TWorkOrderStoring.findOne({
        where: { wo_number },
        paranoid: false,
        transaction: t
      });

      let workOrder;

      if (existing && existing.deleted_at) {
        await existing.restore({ transaction: t });

        await existing.update({
          wo_category: value.wo_category,
          ref_doc_number: value.ref_doc_number,
          ref_doc_name: value.ref_doc_name,
          wo_date: value.wo_date,
          wo_description: value.wo_description,
          wo_type_id: value.wo_type_id,
          warehouse_area_id: value.warehouse_area_id,
          wo_status_id: value.wo_status_id,
          created_by: req.user?.id
        }, { transaction: t });

        workOrder = existing;

        const oldItems = await TWorkOrderStoringItem.findAll({
          where: { wo_id: existing.id },
          attributes: ['id'],
          paranoid: false,
          transaction: t
        });

        const oldItemIds = oldItems.map(i => i.id);

        if (oldItemIds.length) {
          await TWorkOrderStoringItemLabel.destroy({
            where: { wo_item_id: { [Op.in]: oldItemIds } },
            force: true,
            transaction: t
          });
        }

        await TWorkOrderStoringItem.destroy({
          where: { wo_id: existing.id },
          force: true,
          transaction: t
        });
      } else if (existing && !existing.deleted_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Work Order number already exists',
          code: 409
        };
      } else {
        workOrder = await TWorkOrderStoring.create({
          wo_number,
          wo_category: value.wo_category,
          ref_doc_number: value.ref_doc_number,
          ref_doc_name: value.ref_doc_name,
          wo_date: value.wo_date,
          wo_description: value.wo_description,
          wo_type_id: value.wo_type_id,
          warehouse_area_id: value.warehouse_area_id,
          wo_status_id: value.wo_status_id,
          created_by: req.user?.id
        }, { transaction: t });
      }

      const items = value.items.map(item => ({
        wo_id: workOrder.id,
        part_id: item.part_id,
        total_kanban: item.total_kanban
      }));

      const createdItems = await TWorkOrderStoringItem.bulkCreate(items, {
        transaction: t,
        returning: true
      });

      if (value.wo_status_id === 2 && value.wo_category === 'Placement') {
        const labels = [];

        for (const item of createdItems) {
          const part = await SParts.findByPk(item.part_id, { transaction: t });

          if (!part) {
            throw {
              status: false,
              message: `Part with id ${item.part_id} not found`,
              code: 404
            };
          }

          const labelPrefix = `WO-${part.part_number}-${dateStr}-`;

          const countLabel = await TPartLabels.count({
            where: {
              label_number: { [Op.like]: `${labelPrefix}%` }
            },
            transaction: t
          });

          for (let i = 1; i <= item.total_kanban; i++) {
            const labelNumber = `${labelPrefix}${String(countLabel + i).padStart(6, '0')}`;

            const newLabel = await TPartLabels.create({
              label_number: labelNumber,
              part_id: item.part_id
            }, { transaction: t });

            labels.push({
              wo_item_id: item.id,
              label_id: newLabel.id
            });
          }
        }

        if (labels.length) {
          await TWorkOrderStoringItemLabel.bulkCreate(labels, { transaction: t });
        }
      }

      await t.commit();

      return {
        status: true,
        message: existing ? 'Work Order restored & recreated' : 'Work Order created successfully',
        data: workOrder
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

  async update(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;
      const data = req.body;

      const schema = Joi.object({
        wo_category: Joi.string().valid('Placement', 'Take Out').required(),
        ref_doc_number: Joi.string().allow('', null),
        ref_doc_name: Joi.string().allow('', null),
        wo_date: Joi.date().required(),
        wo_description: Joi.string().allow('', null),
        wo_type_id: Joi.number().integer().required(),
        warehouse_area_id: Joi.number().integer().required(),
        wo_status_id: Joi.number().integer().valid(1, 2).required(),

        items: Joi.array().items(
          Joi.object({
            part_id: Joi.number().integer().required(),
            total_kanban: Joi.number().min(1).required()
          })
        ).min(1).required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const value = validation.value;

      const workOrder = await TWorkOrderStoring.findByPk(id, { transaction: t });

      if (!workOrder) {
        await t.rollback();
        return {
          status: false,
          message: 'Work Order not found',
          code: 404
        };
      }

      if (workOrder.wo_status_id !== 1) {
        await t.rollback();
        return {
          status: false,
          message: 'Only Draft Work Order can be edited',
          code: 400
        };
      }

      try {
        await helper.checkExists(SWarehouseAreas, value.warehouse_area_id, 'Warehouse Area', t);
        await helper.checkExists(RefWorkOrderStoringType, value.wo_type_id, 'Work Order Type', t);
      } catch (err) {
        await t.rollback();
        return err;
      }

      await workOrder.update({
        wo_category: value.wo_category,
        ref_doc_number: value.ref_doc_number,
        ref_doc_name: value.ref_doc_name,
        wo_date: value.wo_date,
        wo_description: value.wo_description,
        wo_type_id: value.wo_type_id,
        warehouse_area_id: value.warehouse_area_id,
        wo_status_id: value.wo_status_id
      }, { transaction: t });

      const existingItems = await TWorkOrderStoringItem.findAll({
        where: { wo_id: id },
        transaction: t
      });

      const existingMap = new Map();
      existingItems.forEach(item => {
        existingMap.set(item.part_id, item);
      });

      const incomingPartIds = value.items.map(i => i.part_id);

      const updatedItems = [];

      for (const newItem of value.items) {
        const existing = existingMap.get(newItem.part_id);

        if (existing) {
          await existing.update({
            total_kanban: newItem.total_kanban
          }, { transaction: t });

          updatedItems.push(existing);

        } else {
          const created = await TWorkOrderStoringItem.create({
            wo_id: id,
            part_id: newItem.part_id,
            total_kanban: newItem.total_kanban
          }, { transaction: t });

          updatedItems.push(created);
        }
      }

      const itemsToDelete = existingItems.filter(item =>
        !incomingPartIds.includes(item.part_id)
      );

      const deleteIds = itemsToDelete.map(i => i.id);

      if (deleteIds.length) {
        await TWorkOrderStoringItemLabel.destroy({
          where: { wo_item_id: { [Op.in]: deleteIds } },
          transaction: t
        });

        await TWorkOrderStoringItem.destroy({
          where: { id: { [Op.in]: deleteIds } },
          transaction: t
        });
      }

      if (value.wo_status_id === 2 && value.wo_category === 'Placement') {
        const labels = [];

        const dateStr = dayjs(workOrder.created_at).format('YYMMDD');

        for (const item of createdItems) {
          const part = await SParts.findByPk(item.part_id, { transaction: t });

          if (!part) {
            throw {
              status: false,
              message: `Part with id ${item.part_id} not found`,
              code: 404
            };
          }

          const prefix = `WO-${part.part_number}-${dateStr}-`;

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

          for (let i = 0; i < item.total_kanban; i++) {
            const labelNumber = `${prefix}${String(nextNumber + i).padStart(6, '0')}`;

            const newLabel = await TPartLabels.create({
              label_number: labelNumber,
              part_id: item.part_id
            }, { transaction: t });

            labels.push({
              wo_item_id: item.id,
              label_id: newLabel.id
            });
          }
        }

        if (labels.length) {
          await TWorkOrderStoringItemLabel.bulkCreate(labels, { transaction: t });
        }
      }

      await t.commit();

      return {
        status: true,
        message: 'Work Order updated successfully',
        data: workOrder
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

  async delete(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;

      const workOrder = await TWorkOrderStoring.findByPk(id, {
        transaction: t
      });

      if (!workOrder) {
        await t.rollback();
        return {
          status: false,
          message: 'Work Order not found',
          code: 404
        };
      }

      if (![1, 2].includes(workOrder.wo_status_id)) {
        await t.rollback();
        return {
          status: false,
          message: 'Only Draft or Submitted Work Order can be deleted',
          code: 400
        };
      }

      const items = await TWorkOrderStoringItem.findAll({
        where: { wo_id: id },
        attributes: ['id'],
        transaction: t
      });

      const itemIds = items.map(i => i.id);

      if (itemIds.length) {
        await TWorkOrderStoringItemLabel.destroy({
          where: {
            wo_item_id: { [Op.in]: itemIds }
          },
          transaction: t
        });
      }

      await TWorkOrderStoringItem.destroy({
        where: { wo_id: id },
        transaction: t
      });

      await workOrder.destroy({ transaction: t });

      await t.commit();

      return {
        status: true,
        message: 'Work Order deleted successfully'
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
      const { wo_item_id } = req.params;

      const item = await TWorkOrderStoringItem.findByPk(wo_item_id, {
        attributes: ['id'],
        include: [
          {
            model: TWorkOrderStoring,
            as: 'work_order',
            attributes: ['wo_number']
          },
          {
            model: TWorkOrderStoringItemLabel,
            as: 'item_labels',
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
          message: 'Work Order Item not found'
        });
      }

      if (!item.item_labels || item.item_labels.length === 0) {
        return res.status(400).json({
          status: false,
          message: 'No labels found'
        });
      }

      const workOrder = item.work_order;
      const part = item.item_labels[0]?.label?.part;

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
          bold: path.resolve('fonts/Roboto-Medium.ttf')
        }
      };

      const printer = new PdfPrinter(fonts);

      const labelItems = [];

      for (const labelData of item.item_labels) {
        const label = labelData.label;
        if (!label) continue;

        labelItems.push({
          unbreakable: true,
          stack: [
            {
              columns: [
                {
                  width: '*',
                  text: 'LABEL PART',
                  style: 'title',
                  alignment: 'center',
                  margin: [20, 0, 0, 0]
                },
                {
                  width: 'auto',
                  qr: label.label_number,
                  fit: 60,
                  alignment: 'right'
                }
              ],
              margin: [0, 0, 0, 4]
            },
            {
              text: label.label_number,
              style: 'header',
              alignment: 'right',
              margin: [0, 0, 0, 4]
            },
            {
              table: {
                widths: ['35%', '*'],
                body: [
                  ['Work Order Number', workOrder.wo_number],
                  ['Part Number', part.part_number],
                  ['Part Name', part.part_name],
                  ['Supplier', part.supplier?.name || '-'],
                  ['Printed At', printedAt]
                ].map(row => [
                  { text: row[0], style: 'tableHeader', fillColor: '#EEEEEE' },
                  { text: row[1], style: 'tableBody' }
                ])
              },
              layout: {
                paddingTop: () => 2,
                paddingBottom: () => 2
              }
            }
          ]
        });
      }

      const tableBody = [];

      for (let i = 0; i < labelItems.length; i += 2) {
        tableBody.push([
          {
            margin: [5, 5, 5, 5],
            ...labelItems[i],
            height: 200
          },
          labelItems[i + 1]
            ? {
                margin: [5, 5, 5, 5],
                ...labelItems[i + 1],
                height: 200
              }
            : { text: '', height: 200 }
        ]);
      }

      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [10, 10, 10, 10],
        content: [
          {
            table: {
              widths: ['50%', '50%'],
              body: tableBody
            },
            layout: {
              paddingTop: () => 0,
              paddingBottom: () => 0
            }
          }
        ],
        styles: {
          title: { fontSize: 14, bold: true },
          header: { fontSize: 9, bold: true },
          tableHeader: { fontSize: 8, bold: true },
          tableBody: { fontSize: 8 }
        }
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename=label-${part.part_number}.pdf`
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

  async getDropdownWorkOrderStoringType() {
    try {
      const types = await RefWorkOrderStoringType.findAll({
        attributes: ['id', 'name'],
        order: [['id', 'ASC']]
      });

      return {
        status: true,
        data: types
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

  async getDropdownWorkOrderStoringStatus() {
    try {
      const types = await RefWorkOrderStoringStatus.findAll({
        attributes: ['id', 'name'],
        order: [['id', 'ASC']]
      });

      return {
        status: true,
        data: types
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

export default new WorkOrderStoringModule();