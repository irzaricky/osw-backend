import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const { SDocks, SWarehouseAreas } = db;

class DockModule extends BaseModule {
  
  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';
      const area_id = params.area_id;

      const where = {};

      if (search) {
        where[Op.or] = [
          { dock_code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (area_id) {
        where.area_id = area_id;
      }

      const include = [
        {
          model: SWarehouseAreas,
          as: 'area',
          attributes: ['id', 'area_code', 'name']
        }
      ];

      const { count, rows } = await SDocks.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['area_id', 'deleted_at'] },
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
        dock_code: Joi.string().max(50).required(),
        name: Joi.string().max(100).required(),
        area_id: Joi.number().integer().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { dock_code, name, area_id } = validation.value;

      const area = await SWarehouseAreas.findByPk(area_id, { transaction: t });
      if (!area) {
        await t.rollback();
        return {
          status: false,
          message: 'Warehouse area not found',
          code: 404
        };
      }

      const existingDock = await SDocks.findAll({
        where: {
          dock_code: dock_code
        },
        paranoid: false,
        transaction: t
      });

      const activeConflicts = existingDock.filter(dock => !dock.deleted_at);
      const deletedConflicts = existingDock.filter(dock => dock.deleted_at);

      if (activeConflicts.length > 0) {
        await t.rollback();
        return {
          status: false,
          message: 'Dock code already exists',
          code: 400
        };
      }

      if (deletedConflicts.length > 0) {
        if (deletedConflicts.length > 1) {
          await t.rollback();
          return {
            status: false,
            message: 'Multiple deleted docks with the same code exist. Cannot restore automatically.',
            code: 400
          };
        }

        const dockToRestore = deletedConflicts[0];

        await dockToRestore.restore({ transaction: t });

        dockToRestore.name = name;
        dockToRestore.area_id = area_id;

        await dockToRestore.save({ transaction: t });

        // Log activity
        await this.logActivity(req, {
          moduleCode: 'master-data',
          activityCode: 'CREATE',
          resourceId: dockToRestore.id,
          newData: dockToRestore,
          description: `Restored and updated dock with code ${dock_code}`,
          transaction: t
        });

        await t.commit();
        return {
          status: true,
          message: 'Dock created successfully (Restored from deleted record)',
          data: dockToRestore
        };
      }

      const newDock = await SDocks.create({
        dock_code,
        name,
        area_id
      }, { transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: newDock.id,
        newData: newDock,
        description: `Created new dock with code ${dock_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Dock created successfully',
        data: newDock
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
        dock_code: Joi.string().max(50).optional(),
        name: Joi.string().max(100).optional(),
        area_id: Joi.number().integer().optional()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { dock_code, name, area_id } = validation.value;

      const dock = await SDocks.findByPk(id, { transaction: t });
      if (!dock) {
        await t.rollback();
        return {
          status: false,
          message: 'Dock not found',
          code: 404
        };
      }

      const oldData = JSON.parse(JSON.stringify(dock));

      // Check if dock code already exists
      if (dock_code) {
        const existingDock = await SDocks.findOne({
          where: {
            dock_code: dock_code,
            id: { [Op.ne]: id }
          },
          transaction: t
        });
        if (existingDock) {
          await t.rollback();
          return {
            status: false,
            message: 'Dock code already exists',
            code: 409
          };
        }
      }

      if (area_id) {
        const area = await SWarehouseAreas.findByPk(area_id, { transaction: t });
        if (!area) {
          await t.rollback();
          return {
            status: false,
            message: 'Warehouse area not found',
            code: 404
          };
        }
      }

      if (dock_code) dock.dock_code = dock_code;
      if (name) dock.name = name;
      if (area_id) dock.area_id = area_id;

      await dock.save({ transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: id,
        oldData,
        newData: dock,
        description: `Updated dock with code ${dock.dock_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Dock updated successfully',
        data: dock
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
      
      const dock = await SDocks.findByPk(id, { transaction: t });
      if (!dock) {
        await t.rollback();
        return {
          status: false,
          message: 'Dock not found',
          code: 404
        };
      }

      const oldData = JSON.parse(JSON.stringify(dock));
      await dock.destroy({ transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: id,
        oldData,
        description: `Deleted dock with code ${dock.dock_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Dock deleted successfully'
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

  async getDropdown() {
    try {
      const docks = await SDocks.findAll({
        attributes: ['id', 'dock_code', 'name'],
        order: [['name', 'ASC']]
      });

      return {
        status: true,
        data: docks
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

export default new DockModule();