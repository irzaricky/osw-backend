import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import dayjs from 'dayjs';

const { TWorkOrderStoring, TWorkOrderStoringItem, TWorkOrderStoringItemLabel, RefWorkOrderStoringStatus, RefWorkOrderStoringType, SParts, TPartLabels, SWarehouseAreas } = db;

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

      const count = await TWorkOrderStoring.count({
        where: {
          wo_number: {
            [Op.like]: `${woPrefix}%`
          }
        }
      });

      const wo_number = `${woPrefix}${String(count + 1).padStart(3, '0')}`;

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

      if (value.wo_status_id === 2) {
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

      const oldItems = await TWorkOrderStoringItem.findAll({
        where: { wo_id: id },
        attributes: ['id'],
        transaction: t
      });

      const oldItemIds = oldItems.map(i => i.id);

      if (oldItemIds.length) {
        await TWorkOrderStoringItemLabel.destroy({
          where: { wo_item_id: { [Op.in]: oldItemIds } },
          transaction: t
        });
      }

      await TWorkOrderStoringItem.destroy({
        where: { wo_id: id },
        transaction: t
      });

      const items = value.items.map(item => ({
        wo_id: id,
        part_id: item.part_id,
        total_kanban: item.total_kanban
      }));

      const createdItems = await TWorkOrderStoringItem.bulkCreate(items, {
        transaction: t,
        returning: true
      });

      if (value.wo_status_id === 2) {
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

          const count = await TPartLabels.count({
            where: {
              label_number: { [Op.like]: `${prefix}%` }
            },
            transaction: t
          });

          for (let i = 1; i <= item.total_kanban; i++) {
            const labelNumber = `${prefix}${String(count + i).padStart(6, '0')}`;

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
}

export default new WorkOrderStoringModule();