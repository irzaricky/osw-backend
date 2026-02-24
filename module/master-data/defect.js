import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const { SDefects, RefDefectCategories } = db;

class DefectModule extends BaseModule {

  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';
      const defect_category_id = params.defect_category_id;

      const where = {};

      if (search) {
        where.name = {
          [Op.iLike]: `%${search}%`
        };
      }

      if (defect_category_id) {
        where.defect_category_id = defect_category_id;
      }

      const include = [
        {
          model: RefDefectCategories,
          as: 'category',
          attributes: ['id', 'name']
        }
      ];

      const { count, rows } = await SDefects.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['defect_category_id', 'deleted_at'] },
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
        name: Joi.string().max(100).required(),
        defect_category_id: Joi.number().integer().required(),
        description: Joi.string().max(255).allow(null, '')
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { name, defect_category_id, description } = validation.value;

      const category = await RefDefectCategories.findByPk(defect_category_id, { transaction: t });
      if (!category) {
        await t.rollback();
        return {
          status: false,
          message: 'Defect category not found',
          code: 404
        };
      }

      const existingDefect = await SDefects.findOne({
        where: {
          defect_category_id,
          [Op.and]: db.sequelize.where(
            db.sequelize.fn('LOWER', db.sequelize.col('name')),
            name.toLowerCase()
          ) 
        },
        paranoid: false,
        transaction: t
      })

      if (existingDefect) {
        if (!existingDefect.deleted_at) {
          await t.rollback();
          return {
            status: false,
            message: 'Defect name already exists in this category',
            code: 400
          };
        }

        await existingDefect.restore({ transaction: t });

        existingDefect.description = description;
        await existingDefect.save({ transaction: t });

        // Log activity
        await this.logActivity(req, {
          moduleCode: 'master-data',
          activityCode: 'CREATE',
          resourceId: existingDefect.id,
          newData: existingDefect,
          description: `Restored and updated defect with name ${existingDefect.name}`,
          transaction: t
        });

        await t.commit();
        return {
          status: true,
          message: 'Defect created successfully (Restored from deleted record)',
          data: existingDefect
        };
      }

      const newDefect = await SDefects.create({
        name,
        defect_category_id,
        description
      }, { transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: newDefect.id,
        newData: newDefect,
        description: `Created new defect with name ${newDefect.name}`,
        transaction: t
      });

      await t.commit();
      return {
        status: true,
        message: 'Defect created successfully',
        data: newDefect
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
        name: Joi.string().max(100).optional(),
        defect_category_id: Joi.number().integer().optional(),
        description: Joi.string().max(255).allow(null, '').optional()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { name, defect_category_id, description } = validation.value;

      const defect = await SDefects.findByPk(id, { transaction: t });
      if (!defect) {
        await t.rollback();
        return {
          status: false,
          message: 'Defect not found',
          code: 404
        };
      }
        
      const oldData = JSON.parse(JSON.stringify(defect));

      const finalName = name ?? defect.name;
      const finalCategoryId = defect_category_id ?? defect.defect_category_id;

      if (defect_category_id) {
        const category = await RefDefectCategories.findByPk(defect_category_id, { transaction: t });
        if (!category) {
          await t.rollback();
          return {
            status: false,
            message: 'Defect category not found',
            code: 404
          };
        }
      }

      const existingDefect = await SDefects.findOne({
        where: {
          id: { [Op.ne]: id },
          defect_category_id: finalCategoryId,
          [Op.and]: db.sequelize.where(
            db.sequelize.fn('LOWER', db.sequelize.col('name')),
            finalName.toLowerCase()
          )
        },
        paranoid: false,
        transaction: t
      });

      if (existingDefect && !existingDefect.deleted_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Defect name already exists in this category',
          code: 400
        };
      }

      if (name) defect.name = name;
      if (defect_category_id) defect.defect_category_id = defect_category_id;
      if (description != undefined) defect.description = description;

      await defect.save({ transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: id,
        oldData,
        newData: defect,
        description: `Updated defect with name ${defect.name}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Defect updated successfully',
        data: defect
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

      const defect = await SDefects.findByPk(id, { transaction: t });
      if (!defect) {
        await t.rollback();
        return {
          status: false,
          message: 'Defect not found',
          code: 404
        };
      }

      const oldData = JSON.parse(JSON.stringify(defect));
      await defect.destroy({ transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: id,
        oldData,
        description: `Deleted defect with name ${defect.name}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Defect deleted successfully'
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

  async listDefectCategories(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';

      const where = {};

      if (search) {
        where.name = {
          [Op.iLike]: `%${search}%`
        };
      }

      const { count, rows } = await RefDefectCategories.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['deleted_at'] },
        order: [['name', 'ASC']]
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

  async addDefectCategory(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;

      const schema = Joi.object({
        name: Joi.string().max(50).required(),
        description: Joi.string().max(255).allow(null, '')
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { name, description } = validation.value;

      const existingCategory = await RefDefectCategories.findOne({
        where: {
          [Op.and]: db.sequelize.where(
            db.sequelize.fn('LOWER', db.sequelize.col('name')),
            name.toLowerCase()
          )
        },
        paranoid: false,
        transaction: t
      });

      if (existingCategory) {
        if (!existingCategory.deleted_at) {
          await t.rollback();
          return {
            status: false,
            message: 'Defect category name already exists',
            code: 400
          };
        }
        
        await existingCategory.restore({ transaction: t });

        existingCategory.description = description;
        await existingCategory.save({ transaction: t });

        // Log activity
        await this.logActivity(req, {
          moduleCode: 'master-data',
          activityCode: 'CREATE',
          resourceId: existingCategory.id,
          newData: existingCategory,
          description: `Restored and updated defect category with name ${existingCategory.name}`,
          transaction: t
        });
            
        await t.commit();
        return {
          status: true,
          message: 'Defect created successfully (Restored from deleted record)',
          data: existingCategory
        };
      }

      const newCategory = await RefDefectCategories.create({
        name,
        description
      }, { transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: newCategory.id,
        newData: newCategory,
        description: `Created new defect category with name ${newCategory.name}`,
        transaction: t
      });

      await t.commit();
      return {
        status: true,
        message: 'Defect category created successfully',
        data: newCategory
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

  async updateDefectCategory(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;
      const data = req.body;

      const schema = Joi.object({
        name: Joi.string().max(50).optional(),
        description: Joi.string().max(255).allow(null, '').optional()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { name, description } = validation.value;

      const category = await RefDefectCategories.findByPk(id, { transaction: t });
      if (!category) {
        await t.rollback();
        return {
          status: false,
          message: 'Defect category not found',
          code: 404
        };
      }

      const oldData = JSON.parse(JSON.stringify(category));

      if (name) {
        const existingCategory = await RefDefectCategories.findOne({
          where: {
            id: { [Op.ne]: id },
             [Op.and]: db.sequelize.where(
              db.sequelize.fn('LOWER', db.sequelize.col('name')),
              name.toLowerCase()
            )
          },
          paranoid: false,
          transaction: t
        });

        if (existingCategory && !existingCategory.deleted_at) {
          await t.rollback();
          return {
            status: false,
            message: 'Defect category name already exists',
            code: 400
          };
        }
      }

      if (name) category.name = name;
      if (description != undefined) category.description = description;

      await category.save({ transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: id,
        oldData,
        newData: category,
        description: `Updated defect category with name ${category.name}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Defect category updated successfully',
        data: category
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

  async deleteDefectCategory(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;

      const category = await RefDefectCategories.findByPk(id, { transaction: t });
      if (!category) {
        await t.rollback();
        return {
          status: false,
          message: 'Defect category not found',
          code: 404
        };
      }

      const oldData = JSON.parse(JSON.stringify(category));

      // Check if there are defects associated with this category
      const associatedDefects = await SDefects.count({
        where: { defect_category_id: id },
        paranoid: false,
        transaction: t
      });

      if (associatedDefects > 0) {
        await t.rollback();
        return {
          status: false,
          message: 'Cannot delete defect category because it is still used by defects',
          code: 409
        };
      }

      await category.destroy({ transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: id,
        oldData,
        description: `Deleted defect category with name ${category.name}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Defect category deleted successfully'
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

  async getDropdownDefects() {
    try {
      const defects = await SDefects.findAll({
        attributes: ['id', 'name'],
        include: [
          {
            model: RefDefectCategories,
            as: 'category',
            attributes: ['id', 'name']
          }
        ],
        order: [['name', 'ASC']]
      });

      return {
        status: true,
        data: defects
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

  async getDropdownDefectCategories() {
    try {
      const categories = await RefDefectCategories.findAll({
        attributes: ['id', 'name'],
        order: [['name', 'ASC']]
      });

      return {
        status: true,
        data: categories
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

export default new DefectModule();