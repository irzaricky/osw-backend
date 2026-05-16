import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const { SWarehouseBins, SWarehouseAreas } = db;

class WarehouseBinsModule extends BaseModule {

  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';
      const area_id = params.area_id;

      const where = {};

      if (search) {
        where[Op.or] = [
          { bin_code: { [Op.iLike]: `%${search}%` } },
          { dedicated_part_number: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (area_id) {
        where.area_id = area_id;
      }

      const { count, rows } = await SWarehouseBins.findAndCountAll({
        where,
        limit,
        offset,
        include: [
          {
            model: SWarehouseAreas,
            as: 'area',
            attributes: ['id', 'area_code', 'name']
          }
        ],
        order: [['row_index', 'ASC'], ['col_index', 'ASC']]
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
      const schema = Joi.object({
        bin_code: Joi.string().max(50).required(),
        area_id: Joi.number().integer().required(),
        row_index: Joi.number().integer().required(),
        col_index: Joi.number().integer().required(),
        is_dedicated: Joi.boolean().default(false),
        dedicated_part_number: Joi.string().allow(null, ''),
        capacity: Joi.number().integer().required()
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const data = validation.value;

      const area = await SWarehouseAreas.findByPk(data.area_id, { transaction: t });
      if (!area) {
        await t.rollback();
        return { status: false, message: 'Warehouse Area not found', code: 404 };
      }

      const existing = await SWarehouseBins.findOne({
        where: { bin_code: data.bin_code },
        transaction: t
      });

      if (existing) {
        await t.rollback();
        return { status: false, message: 'Bin code already exists', code: 409 };
      }

      const newBin = await SWarehouseBins.create(data, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: newBin.id,
        newData: newBin,
        description: `Created warehouse bin ${data.bin_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        data: newBin,
        message: 'Warehouse Bin created successfully'
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

      const bin = await SWarehouseBins.findByPk(id, { transaction: t });
      if (!bin) {
        await t.rollback();
        return { status: false, message: 'Warehouse Bin not found', code: 404 };
      }

      const oldData = JSON.parse(JSON.stringify(bin));

      const schema = Joi.object({
      bin_code: Joi.string().max(50),
      area_id: Joi.number().integer(),
      row_index: Joi.number().integer(),
      col_index: Joi.number().integer(),
      is_dedicated: Joi.boolean(),
      dedicated_part_number: Joi.string().allow(null, ''),
      capacity: Joi.number().integer()
    });

    const validation = helper.validate(req.body, schema);

    if (!validation.status) {
      await t.rollback();
      return validation;
    }

    const data = validation.value;

    await bin.update(data, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: id,
        oldData,
        newData: bin,
        description: `Updated warehouse bin ${bin.bin_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        data: bin,
        message: 'Warehouse Bin updated successfully'
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

      const bin = await SWarehouseBins.findByPk(id, { transaction: t });
      if (!bin) {
        await t.rollback();
        return { status: false, message: 'Warehouse Bin not found', code: 404 };
      }

      const oldData = JSON.parse(JSON.stringify(bin));

      await bin.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: id,
        oldData,
        description: `Deleted warehouse bin ${bin.bin_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Warehouse Bin deleted successfully'
      };

    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }
}

export default new WarehouseBinsModule();