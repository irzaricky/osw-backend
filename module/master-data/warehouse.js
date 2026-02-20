import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const { SWarehouses, SLines, RefWarehouseCategories } = db;

class WarehouseModule extends BaseModule {

  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';
      const line_id = params.line_id;
      const category_id = params.category_id;

      const where = {};

      if (search) {
        where[Op.or] = [
          { warehouse_code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (line_id) {
        where.line_id = line_id;
      }

      if (category_id) {
        where.category_id = category_id;
      }

      const include = [
        {
          model: SLines,
          as: 'line',
          attributes: ['id', 'name']
        },
        {
          model: RefWarehouseCategories,
            as: 'category',
            attributes: ['id', 'name']
        }
      ];

      const { count, rows } = await SWarehouses.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['line_id', 'category_id', 'deleted_at'] },
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
        warehouse_code: Joi.string().max(50).required(),
        name: Joi.string().max(100).required(),
        line_id: Joi.number().integer().allow(null),
        category_id: Joi.number().integer().required(),
        notes: Joi.string().allow(null, '')
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { warehouse_code, name, line_id, category_id, notes } = validation.value;

      const category = await RefWarehouseCategories.findByPk(category_id, { transaction: t });
      if (!category) {
        await t.rollback();
        return {
          status: false,
          message: 'Warehouse Category not found',
          code: 404
        };
      }

      if (line_id !== undefined && line_id !== null) {
        const line = await SLines.findByPk(line_id, { transaction: t });

        if (!line) {
          await t.rollback();
          return {
            status: false,
            message: 'Line not found',
            code: 404
          };
        }
      }

      const existingWarehouses = await SWarehouses.findAll({
        where: {
          warehouse_code: warehouse_code
        },
        paranoid: false,
        transaction: t
      });

      const activeConflicts = existingWarehouses.filter(w => !w.deleted_at);
      const deletedConflicts = existingWarehouses.filter(w => w.deleted_at);

      if (activeConflicts.length > 0) {
        await t.rollback();
        return {
          status: false,
          message: 'Warehouse code already exists',
          code: 400
        };
      }

      if (deletedConflicts.length > 0) {
        if (deletedConflicts.length > 1) {
          await t.rollback();
          return {
            status: false,
            message: 'Multiple deleted warehouses with the same code exist. Cannot restore automatically.',
            code: 400
          };
        }

        const warehouseToRestore = deletedConflicts[0];

        await warehouseToRestore.restore({ transaction: t });

        warehouseToRestore.name = name;
        warehouseToRestore.line_id = line_id;
        warehouseToRestore.category_id = category_id;
        warehouseToRestore.notes = notes;

        await warehouseToRestore.save({ transaction: t });

        // Log activity
        await this.logActivity(req, {
          moduleCode: 'master-data',
          activityCode: 'CREATE',
          resourceId: warehouseToRestore.id,
          newData: warehouseToRestore,
          description: `Restored and updated warehouse with code ${warehouse_code}`,
          transaction: t
        });

        await t.commit();
        return {
          status: true,
          data: warehouseToRestore,
          message: 'Warehouse created successfully (Restored from deleted record)'
        };
      }

      const newWarehouse = await SWarehouses.create({
        warehouse_code,
        name,
        line_id,
        category_id,
        notes
      }, { transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: newWarehouse.id,
        newData: newWarehouse,
        description: `Created new warehouse with code ${warehouse_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        data: newWarehouse,
        message: 'Warehouse created successfully'
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
        warehouse_code: Joi.string().max(50).optional(),
        name: Joi.string().max(100).optional(),
        line_id: Joi.number().integer().allow(null).optional(),
        category_id: Joi.number().integer().optional(),
        notes: Joi.string().allow(null, '').optional()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { warehouse_code, name, line_id, category_id, notes } = validation.value;

      const warehouse = await SWarehouses.findByPk(id, { transaction: t });
      if (!warehouse) {
        await t.rollback();
        return {
          status: false,
          message: 'Warehouse not found',
          code: 404
        };
      }

      const oldData = JSON.parse(JSON.stringify(warehouse));

      // Check if warehouse code already exists
      if (warehouse_code) {
        const existingWarehouses = await SWarehouses.findOne({
          where: {
            warehouse_code: warehouse_code,
            id: { [Op.ne]: id }
          },
          transaction: t
        });

        if (existingWarehouses) {
          await t.rollback();
          return {
            status: false,
            message: 'Warehouse code already exists',
            code: 409
          };
        }
      }

      if (category_id) {
        const category = await RefWarehouseCategories.findByPk(category_id, { transaction: t });
        if (!category) {
          await t.rollback();
          return {
            status: false,
            message: 'Warehouse Category not found',
            code: 404
          };
        }
      }

      if (line_id !== undefined && line_id !== null) {
        const line = await SLines.findByPk(line_id, { transaction: t });
        if (!line) {
          await t.rollback();
          return {
            status: false,
            message: 'Line not found',
            code: 404
          };
        }
      }

      if (warehouse_code) warehouse.warehouse_code = warehouse_code;
      if (name) warehouse.name = name;
      if (line_id !== undefined) warehouse.line_id = line_id;
      if (category_id) warehouse.category_id = category_id;
      if (notes !== undefined) warehouse.notes = notes;

      await warehouse.save({ transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: id,
        oldData,
        newData: warehouse,
        description: `Updated warehouse with code ${warehouse.warehouse_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        data: warehouse,
        message: 'Warehouse updated successfully'
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
      const warehouse = await SWarehouses.findByPk(id, { transaction: t });

      if (!warehouse) {
        await t.rollback();
        return {
          status: false,
          message: 'Warehouse not found',
          code: 404
        };
      }

      const oldData = JSON.parse(JSON.stringify(warehouse));
      await warehouse.destroy({ transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: id,
        oldData,
        description: `Deleted warehouse with code ${warehouse.warehouse_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Warehouse deleted successfully'
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

export default new WarehouseModule();