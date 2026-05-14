import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import BaseModule from "../../class/base.module.js";

const { 
  SSuppliers,
  SMaterialPurchaseOrder,
  SMaterialDeliveryOrder,
  TMaterialReceiving, 
} = db;

class MaterialReceivingModule extends BaseModule {
  async dropdown(req, res) {
    try {
      const rows = await TMaterialReceiving.findAll({
        attributes: ['id'],
        where: {
          status_id: 5 // Good Receipt
        },
        include: [
          {
            model: SMaterialDeliveryOrder,
            as: 'mdo',
            attributes: ['id', 'number'],
            required: true,
            include: [
              {
                model: SMaterialPurchaseOrder,
                as: 'mpo',
                attributes: ['id'],
                include: [
                  {
                    model: SSuppliers,
                    as: 'supplier',
                    attributes: ['id', 'name']
                  }
                ]
              }
            ]
          }
        ],
        order: [['id', 'DESC']]
      })

      const formatted = rows.map(row => ({
        id: row.id,
        number: row.mdo?.number || '-',
        supplier_name: row.mdo?.mpo?.supplier?.name || '-'
      }))

      return {
        status: true,
        data: formatted
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

export default new MaterialReceivingModule();