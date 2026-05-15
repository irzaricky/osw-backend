import db from '../../models/index.js'
import { config } from '../../config/app.config.js'
import { Op } from 'sequelize'
import helper from '../../class/helper.class.js'
import BaseModule from '../../class/base.module.js'
import Joi from 'joi'

const { SUom, sequelize } = db

class UomModule extends BaseModule {
  async dropdown(req, res) {
    try {
      const params = req.query || {}
      const search = (params.search || '').trim()

      const where = { deleted_at: null, is_active: true }

      if (search) {
        where[Op.or] = [
          { code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } },
        ]
      }

      const uoms = await SUom.findAll({
        where,
        attributes: ['id', 'code', 'name'],
        order: [['name', 'ASC']],
      })

      return helper.sendResponse(res, { status: true, code: 200, data: uoms })
    } catch (error) {
      console.log('[UomModule][dropdown]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: config.debug ? error.message : 'Internal Server Error',
      })
    }
  }

  async list(req, res) {
    try {
      const params = req.query || {}
      const { limit, page, offset } = helper.getPagination(params)
      const search    = params.search    || ''
      const is_active = params.is_active ?? null

      const where = { deleted_at: null }

      if (search) {
        where[Op.or] = [
          { code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } },
        ]
      }

      if (is_active !== null) {
        where.is_active = is_active === 'true'
      }

      const { count, rows } = await SUom.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ['deleted_at'] },
        order: [['created_at', 'DESC']],
      })

      return helper.sendResponse(res, {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      })
    } catch (error) {
      console.log('[UomModule][list]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error',
      })
    }
  }

  async add(req, res) {
    const t = await sequelize.transaction()
    try {
      const schema = Joi.object({
        code:      Joi.string().max(50).uppercase().required(),
        name:      Joi.string().max(100).required(),
        is_active: Joi.boolean().default(true),
      })

      const validation = helper.validate(req.body, schema)
      if (!validation.status) {
        await t.rollback()
        return helper.sendResponse(res, validation)
      }

      const { code, name, is_active } = validation.value

      const existing = await SUom.findOne({
        where: { code },
        paranoid: false,
        transaction: t,
      })

      if (existing && !existing.deleted_at) {
        await t.rollback()
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: 'UOM code already exists',
        })
      }

      let uom

      if (existing && existing.deleted_at) {
        const oldData = existing.toJSON()
        await existing.restore({ transaction: t })
        await existing.update({ name, is_active }, { transaction: t })
        uom = existing

        await this.logActivity(req, {
          moduleCode:   'master-data',
          activityCode: 'RESTORE',
          resourceId:   existing.id,
          oldData,
          newData:      existing,
          description:  `Restored UOM ${code}`,
          transaction:  t,
        })
      } else {
        uom = await SUom.create({ code, name, is_active }, { transaction: t })

        await this.logActivity(req, {
          moduleCode:   'master-data',
          activityCode: 'CREATE',
          resourceId:   uom.id,
          newData:      uom,
          description:  `Created UOM ${code}`,
          transaction:  t,
        })
      }

      await t.commit()
      return helper.sendResponse(res, {
        status: true,
        code: 201,
        message: 'UOM created successfully',
        data: uom,
      })
    } catch (error) {
      await t.rollback()
      console.log('[UomModule][add]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error',
      })
    }
  }

  async update(req, res) {
    const t = await sequelize.transaction()
    try {
      const { id } = req.params

      const schema = Joi.object({
        code:      Joi.string().max(50).uppercase().required(),
        name:      Joi.string().max(100).required(),
        is_active: Joi.boolean().required(),
      })

      const validation = helper.validate(req.body, schema)
      if (!validation.status) {
        await t.rollback()
        return helper.sendResponse(res, validation)
      }

      const { code, name, is_active } = validation.value

      const uom = await SUom.findByPk(id, { transaction: t })
      if (!uom) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 404, message: 'UOM not found' })
      }

      // Cek duplikasi code (exclude diri sendiri)
      const duplicate = await SUom.findOne({
        where: { code, id: { [Op.ne]: id } },
        paranoid: false,
        transaction: t,
      })
      if (duplicate && !duplicate.deleted_at) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 400, message: 'UOM code already exists' })
      }
      if (duplicate && duplicate.deleted_at) {
        await duplicate.destroy({ force: true, transaction: t })
      }

      const oldData = uom.toJSON()
      await uom.update({ code, name, is_active }, { transaction: t })

      await this.logActivity(req, {
        moduleCode:   'master-data',
        activityCode: 'UPDATE',
        resourceId:   uom.id,
        oldData,
        newData:      uom,
        description:  `Updated UOM ${code}`,
        transaction:  t,
      })

      await t.commit()
      return helper.sendResponse(res, {
        status: true,
        code: 200,
        message: 'UOM updated successfully',
        data: uom,
      })
    } catch (error) {
      await t.rollback()
      console.log('[UomModule][update]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error',
      })
    }
  }

  async delete(req, res) {
    const t = await sequelize.transaction()
    try {
      const { id } = req.params

      const uom = await SUom.findByPk(id, { transaction: t })
      if (!uom) {
        await t.rollback()
        return helper.sendResponse(res, { status: false, code: 404, message: 'UOM not found' })
      }

      const oldData = uom.toJSON()
      await uom.destroy({ transaction: t })

      await this.logActivity(req, {
        moduleCode:   'master-data',
        activityCode: 'DELETE',
        resourceId:   uom.id,
        oldData,
        description:  `Deleted UOM ${uom.code}`,
        transaction:  t,
      })

      await t.commit()
      return helper.sendResponse(res, { status: true, code: 200, message: 'UOM deleted successfully' })
    } catch (error) {
      await t.rollback()
      console.log('[UomModule][delete]:', error)
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error',
      })
    }
  }
}

export default new UomModule()