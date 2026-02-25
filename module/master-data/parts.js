import db from '../../models/index.js'
import { config } from '../../config/app.config.js'
import { Op } from 'sequelize'
import BaseModule from '../../class/base.module.js'

const { SParts } = db

class PartsModule extends BaseModule {
  async dropdown(req) {
    try {
      const params = req.query || {}

      const search = (params.search || '').trim()
      const partTypeCode = (params.part_type_code || '').trim() 

      const where = {}

      // filter part type
      if (partTypeCode) {
        where.part_type_code = partTypeCode
      }

      if (search) {
        where[Op.or] = [
          { part_number: { [Op.iLike]: `%${search}%` } },
          { part_name: { [Op.iLike]: `%${search}%` } }
        ]
      }

      const rows = await SParts.findAll({
        where,
        attributes: ['id', 'part_number', 'part_name', 'part_type_code'],
        order: [['part_number', 'ASC']]
      })

      return { status: true, data: rows }
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 }
      return { status: false, message: 'Internal server error', code: 500 }
    }
  }
}

export default new PartsModule()