import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const { SWarehouseAreas, SWarehouses, RefWarehouseCategories } = db;

class WarehouseAreaModule extends BaseModule {

  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';
      const warehouse_id = params.warehouse_id;

      const where = {};

      if (search) {
        where[Op.or] = [
          { area_code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (warehouse_id) {
        where.warehouse_id = warehouse_id;
      }

      const include = [
        {
          model: SWarehouses,
          as: 'warehouse',
          attributes: ['id', 'warehouse_code', 'name'],
          include: [
            {
              model: RefWarehouseCategories,
              as: 'category',
              attributes: ['id', 'name']
            }
          ]
        }
      ];

      const { count, rows } = await SWarehouseAreas.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['deleted_at'] },
        include,
        order: [['created_at', 'DESC']]
      });

      return {
        status: true,
        data: helper.getPaginationData(rows, count, page, limit)
      };

    } catch (error) {
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async add(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;

      const schema = Joi.object({
        warehouse_id: Joi.number().integer().required(),
        area_code: Joi.string().max(50).required(),
        name: Joi.string().max(100).required(),
        total_cols: Joi.number().integer().min(1).required(),
        total_rows: Joi.number().integer().min(1).required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { warehouse_id, area_code, name, total_cols, total_rows } = validation.value;

      const warehouse = await SWarehouses.findByPk(warehouse_id, { transaction: t });
      if (!warehouse) {
        await t.rollback();
        return { status: false, message: 'Warehouse not found', code: 404 };
      }

      // Check duplicate area_code per warehouse
      const existing = await SWarehouseAreas.findOne({
        where: {
          warehouse_id,
          area_code
        },
        transaction: t
      });

      if (existing) {
        await t.rollback();
        return {
          status: false,
          message: 'Warehouse Area code already exists in this warehouse',
          code: 409
        };
      }

      const newArea = await SWarehouseAreas.create({
        warehouse_id,
        area_code,
        name,
        total_cols,
        total_rows
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: newArea.id,
        newData: newArea,
        description: `Created warehouse area ${area_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        data: newArea,
        message: 'Warehouse Area created successfully'
      };

    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async update(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;
      const data = req.body;

      const schema = Joi.object({
        warehouse_id: Joi.number().integer().optional(),
        area_code: Joi.string().max(50).optional(),
        name: Joi.string().max(100).optional(),
        total_cols: Joi.number().integer().min(1).optional(),
        total_rows: Joi.number().integer().min(1).optional()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const area = await SWarehouseAreas.findByPk(id, { transaction: t });
      if (!area) {
        await t.rollback();
        return { status: false, message: 'Warehouse Area not found', code: 404 };
      }

      const oldData = JSON.parse(JSON.stringify(area));

      const { warehouse_id, area_code, name, total_cols, total_rows } = validation.value;

      if (warehouse_id) {
        const warehouse = await SWarehouses.findByPk(warehouse_id, { transaction: t });
        if (!warehouse) {
          await t.rollback();
          return { status: false, message: 'Warehouse not found', code: 404 };
        }
        area.warehouse_id = warehouse_id;
      }

      if (area_code) area.area_code = area_code;
      if (name) area.name = name;
      if (total_cols) area.total_cols = total_cols;
      if (total_rows) area.total_rows = total_rows;

      await area.save({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: id,
        oldData,
        newData: area,
        description: `Updated warehouse area ${area.area_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        data: area,
        message: 'Warehouse Area updated successfully'
      };

    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async delete(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;

      const area = await SWarehouseAreas.findByPk(id, { transaction: t });
      if (!area) {
        await t.rollback();
        return { status: false, message: 'Warehouse Area not found', code: 404 };
      }

      const oldData = JSON.parse(JSON.stringify(area));

      await area.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: id,
        oldData,
        description: `Deleted warehouse area ${area.area_code}`,
        transaction: t
      });

      await t.commit();

      return { status: true, message: 'Warehouse Area deleted successfully' };

    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

}

export default new WarehouseAreaModule();