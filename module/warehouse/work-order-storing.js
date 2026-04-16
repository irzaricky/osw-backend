import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const { TWorkOrderStoring, TWorkOrderStoringItem, TWorkOrderStoringItemLabel, RefWorkOrderStoringStatus, RefWorkOrderStoringType } = db;

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
}

export default new WorkOrderStoringModule();