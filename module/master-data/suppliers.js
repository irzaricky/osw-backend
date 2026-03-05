import db from "../../models/index.js";
import { config } from "../../config/app.config.js";
import { Op } from "sequelize";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import Joi from "joi";

const { SSuppliers, sequelize } = db

class SuppliersModule extends BaseModule {
  async dropdown(req, res) {
    let tmp = {};
    try {
      const params = req.query || {}

      const search = (params.search || '').trim()

      const where = { deleted_at: null }

      if (search) {
        where[Op.or] = [
          { supplier_code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } }
        ]
      }

      const suppliers = await SSuppliers.findAll({
        where,
        attributes: ["id", "supplier_code", "name"],
        order: [["name", "ASC"]],
      });

      tmp = {
        status: true,
        code: 200,
        data: suppliers,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[SuppliersModule][dropdown]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async list(req, res) {
    let tmp = {};
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || "";

      const where = { deleted_at: null };

      if (search) {
        where[Op.or] = [
          { supplier_code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await SSuppliers.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ["deleted_at"] },
        order: [["created_at", "DESC"]],
      });

      tmp = {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[SuppliersModule][list]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async add(req, res) {
    let tmp = {};
    const t = await sequelize.transaction();
    try {
      const schema = Joi.object({
        supplier_code: Joi.string().max(100).required(),
        name: Joi.string().max(150).required(),
        email: Joi.string().email().max(100).allow(null, ''),
        notes: Joi.string().allow(null, '')
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { supplier_code, name, email, notes } = validation.value;

      const existing = await SSuppliers.findOne({
        where: { supplier_code },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          message: 'Supplier code already exists',
        };
        return helper.sendResponse(res, tmp);
      }

      let supplier;

      if (existing && existing.deleted_at) {
        const oldData = existing.toJSON();
        await existing.restore({ transaction: t });

        existing.name = name ?? existing.name;
        existing.email = email ?? existing.email;
        existing.notes = notes ?? existing.notes;

        await existing.save({ transaction: t });

        supplier = existing;
        await this.logActivity(req, {
          moduleCode: 'master-data',
          activityCode: 'RESTORE',
          resourceId: existing.id,
          oldData,
          newData: existing,
          description: `Restored supplier with name ${name}`,
          transaction: t,
        });
      } else {
        supplier = await SSuppliers.create(
          { supplier_code, name, email, notes },
          { transaction: t }
        );
      }

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: supplier.id,
        newData: supplier,
        description: `Created supplier with name ${name}`,
        transaction: t,
      });

      await t.commit();

      tmp = {
        status: true,
        code: 201,
        message: 'Supplier created successfully',
        data: supplier,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[SuppliersModule][add]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || 'Internal Server Error',
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async update(req, res) {
    let tmp = {};
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        supplier_code: Joi.string().max(100).required(),
        name: Joi.string().max(150).required(),
        email: Joi.string().email().max(100).allow(null, ''),
        notes: Joi.string().allow(null, '')
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { supplier_code, name, email, notes } = validation.value;

      const supplier = await SSuppliers.findByPk(id, { transaction: t });
      if (!supplier) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: 'Supplier not found',
        };
        return helper.sendResponse(res, tmp);
      }

      const existing = await SSuppliers.findOne({
        where: {
          supplier_code,
          id: { [Op.ne]: id },
        },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          message: 'Supplier code already exists',
        };
        return helper.sendResponse(res, tmp);
      }

      if (existing && existing.deleted_at) {
        await existing.destroy({ force: true, transaction: t });
      }

      const oldData = supplier.toJSON();

      await supplier.update({
        supplier_code,
        name,
        email,
        notes
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: supplier.id,
        oldData,
        newData: supplier,
        description: `Updated supplier with name ${name}`,
        transaction: t,
      });

      await t.commit();

      tmp = {
        status: true,
        code: 200,
        message: 'Supplier updated successfully',
        data: supplier,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[SuppliersModule][update]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || 'Internal Server Error',
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async delete(req, res) {
    let tmp = {};
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const supplier = await SSuppliers.findByPk(id, { transaction: t });
      if (!supplier) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: 'Supplier not found',
        };
        return helper.sendResponse(res, tmp);
      }

      const oldData = supplier.toJSON();

      await supplier.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: supplier.id,
        oldData,
        description: `Deleted supplier with name ${supplier.name}`,
        transaction: t,
      });

      await t.commit();

      tmp = {
        status: true,
        code: 200,
        message: 'Supplier deleted successfully',
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[SuppliersModule][delete]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || 'Internal Server Error',
      };
      return helper.sendResponse(res, tmp);
    }
  }
}

export default new SuppliersModule();