import db from '../../models/index.js';

import { config } from '../../config/app.config.js';

import BaseModule from '../../class/base.module.js';

const {
  TNgTicket,
  TNgTicketQuantity,
  TNgTicketQuality,

  TMaterialReceivingItemLabel,
  TMaterialReceivingItem,
  TMaterialReceiving,

  TPartLabels,

  SDefects
} = db;

class WarrantyAndClaimModule extends BaseModule {

  async list(req) {
    try {

      const ngTickets =
        await TNgTicket.findAll({
          attributes: [
            'id',
            'ng_ticket_number',
            'created_at'
          ],

          include: [
            {
              model:
                TMaterialReceivingItemLabel,

              as: 'mr_item_label',

              required: false,

              attributes: [
                'id',
                'is_quantity',
                'is_quality'
              ],

              include: [
                {
                  model:
                    TPartLabels,

                  as: 'label',

                  required: false,

                  attributes: [
                    'id',
                    'label_number'
                  ]
                },

                {
                  model:
                    TMaterialReceivingItem,

                  as:
                    'material_receiving_item',

                  required: false,

                  attributes: [
                    'id'
                  ],

                  include: [
                    {
                      model:
                        TMaterialReceiving,

                      as:
                        'material_receiving',

                      required: false,

                      attributes: [
                        'id',
                        'mdo_id'
                      ]
                    }
                  ]
                }
              ]
            },

            {
              model:
                TNgTicketQuantity,

              as: 'quantity',

              required: false,

              attributes: [
                'expected_qty',
                'actual_qty'
              ]
            },

            {
              model:
                TNgTicketQuality,

              as: 'qualities',

              required: false,

              attributes: [
                'id',
                'image'
              ],

              include: [
                {
                  model:
                    SDefects,

                  as: 'defect',

                  required: false,

                  attributes: [
                    'id',
                    'name'
                  ]
                }
              ]
            }
          ],

          order: [
            ['created_at', 'DESC']
          ]
        });

      //
      // Mapping
      //

      const mappedData =
        ngTickets.map(
          (item, index) => {

            const isQuantityNG =
              item.mr_item_label
                ?.is_quantity === false;

            const isQualityNG =
              item.mr_item_label
                ?.is_quality === false;

            return {

              no: index + 1,

              id:
                item.id,

              mr_id:
                item.mr_item_label
                  ?.material_receiving_item
                  ?.material_receiving
                  ?.id || null,

              mdo_id:
                item.mr_item_label
                  ?.material_receiving_item
                  ?.material_receiving
                  ?.mdo_id || null,

              ng_ticket_number:
                item.ng_ticket_number,

              category:
                isQuantityNG
                  ? 'Quantity'
                  : 'Quality',

              label_number:
                item.mr_item_label
                  ?.label?.label_number ||
                null,

              quantity:
                isQuantityNG
                  ? {
                      expected_qty:
                        item.quantity
                          ?.expected_qty ||
                        0,

                      actual_qty:
                        item.quantity
                          ?.actual_qty ||
                        0
                    }
                  : null,

              defects:
                isQualityNG
                  ? (
                      item.qualities || []
                    ).map(
                      (quality) => ({
                        id:
                          quality.id,

                        defect_id:
                          quality.defect
                            ?.id || null,

                        defect_name:
                          quality.defect
                            ?.name || null,

                        image:
                          quality.image
                      })
                    )
                  : [],

              created_at:
                item.created_at
            };
          }
        );

      return {
        status: true,
        data: mappedData
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
        message:
          'Internal server error',
        code: 500
      };
    }
  }
}

export default new WarrantyAndClaimModule();