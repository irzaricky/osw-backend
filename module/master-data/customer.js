import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import xlsx from 'xlsx';

const { SCustomers } = db;

class CustomerModule extends BaseModule {
  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';

      const where = {};

      if (search) {
        where[Op.or] = [
          { customer_code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await SCustomers.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['createdAt', 'updatedAt', 'deleted_at'] },
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
        customer_code: Joi.string().max(50).required(),
        name: Joi.string().max(100).required(),
        email: Joi.string().email().max(100).required(),
        address: Joi.string().allow(null, '')
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { customer_code, name, email, address } = validation.value;

      const existingCode = await SCustomers.findOne({
        where: { customer_code },
        paranoid: false,
        transaction: t
      });

      if (existingCode) {
        if (existingCode.deleted_at) {
          await t.rollback();
          return {
            status: false,
            message: 'Customer code exists but is deleted',
            code: 400
          };
        }
        await t.rollback();
        return {
          status: false,
          message: 'Customer code already exists',
          code: 400
        };
      }

      const existingEmail = await SCustomers.findOne({
        where: { email },
        paranoid: false,
        transaction: t
      });

      if (existingEmail) {
        if (existingEmail.deleted_at) {
          await t.rollback();
          return {
            status: false,
            message: 'Email exists but is deleted',
            code: 400
          };
        }
        await t.rollback();
        return {
          status: false,
          message: 'Email already exists',
          code: 400
        };
      }

      const newCustomer = await SCustomers.create({
        customer_code,
        name,
        email,
        address
      }, { transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: newCustomer.id,
        newData: newCustomer,
        description: `Created new customer with code ${customer_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Customer created successfully',
        data: newCustomer
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
        customer_code: Joi.string().max(50).optional(),
        name: Joi.string().max(100).optional(),
        email: Joi.string().email().max(100).optional(),
        address: Joi.string().allow(null, '').optional()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { customer_code, name, email, address } = validation.value;

      const customer = await SCustomers.findByPk(id, { transaction: t });
      if (!customer) {
        await t.rollback();
        return {
          status: false,
          message: 'Customer not found',
          code: 404
        };
      }

      const oldData = JSON.parse(JSON.stringify(customer));

      if (customer_code) {
        const existingCode = await SCustomers.findOne({
          where: {
            customer_code: customer_code,
            id: { [Op.ne]: id }
          },
          transaction: t
        });

        if (existingCode) {
          await t.rollback();
          return {
            status: false,
            message: 'Customer code already exists',
            code: 409
          };
        }
      }

      if (email) {
        const existingEmail = await SCustomers.findOne({
          where: {
            email: email,
            id: { [Op.ne]: id }
          },
          transaction: t
        });

        if (existingEmail) {
          await t.rollback();
          return {
            status: false,
            message: 'Customer email already exists',
            code: 409
          };
        }
      }

      if (customer_code) customer.customer_code = customer_code;
      if (name) customer.name = name;
      if (email) customer.email = email;
      if (address !== undefined) customer.address = address;

      await customer.save({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: id,
        oldData,
        newData: customer,
        description: `Updated customer with code ${customer.customer_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Customer updated successfully',
        data: customer
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

      const customer = await SCustomers.findByPk(id, { transaction: t });
      if (!customer) {
        await t.rollback();
        return {
          status: false,
          message: 'Customer not found',
          code: 404
        };
      }

      const oldData = JSON.parse(JSON.stringify(customer));
      await customer.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: id,
        oldData,
        description: `Deleted customer with code ${customer.customer_code}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Customer deleted successfully'
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

  async download(req) {
    try {
      const params = req.query;
      const search = params.search || '';

      const where = {};

      if (search) {
        where[Op.or] = [
          { customer_code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const customers = await SCustomers.findAll({
        where,
        order: [['created_at', 'DESC']]
      });

      const data = customers.map(customer => ({
        'Customer Code': customer.customer_code,
        'Name': customer.name,
        'Email': customer.email,
        'Address': customer.address,
        'Created At': helper.formatDate(customer.createdAt)
      }));

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(data);

      const colWidths = [
        { wch: 20 }, // Code
        { wch: 30 }, // Name
        { wch: 30 }, // Email
        { wch: 50 }, // Address
        { wch: 20 }  // Created At
      ];
      ws['!cols'] = colWidths;

      xlsx.utils.book_append_sheet(wb, ws, 'Customers');

      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return {
        status: true,
        data: buffer,
        filename: `master_customers_${helper.formatDate(new Date(), 'YYYYMMDD_HHmmss')}.xlsx`
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

export default new CustomerModule();
