import { Op } from 'sequelize';
import Joi from 'joi';
import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import helper from '../../class/helper.class.js';
import BaseModule from "../../class/base.module.js";

const {
  TMaterialReceiving,
  TMaterialReceivingItem,
  TMaterialReceivingItemLabel,
  TGoodReceipt,

  SMaterialDeliveryOrder,
  SMaterialPurchaseOrder,
  SSuppliers
} = db;

class GoodReceiptModule extends BaseModule {

  async list(req) {
    try {

      const materialReceivings =
        await TMaterialReceiving.findAll({
          where: {
            status_id: {
              [Op.in]: [
                4, // Waiting GR Approval
                5  // Good Receipt
              ]
            }
          },

          attributes: [
            'id',
            'status_id'
          ],

          include: [
            {
              model:
                SMaterialDeliveryOrder,

              as: 'mdo',

              attributes: [
                'id',
                'number'
              ],

              include: [
                {
                  model:
                    SMaterialPurchaseOrder,

                  as: 'mpo',

                  attributes: [
                    'id',
                    'number'
                  ],
                  include: [
                    {
                      model: SSuppliers,
                      as: 'supplier',
                      attributes: [
                        'id',
                        'name'
                      ]
                    }
                  ]
                },
              ]
            },

            {
              model:
                TMaterialReceivingItem,

              as: 'items',

              required: false,

              attributes: [
                'id'
              ],

              include: [
                {
                  model:
                    TMaterialReceivingItemLabel,

                  as: 'labels',

                  required: false,

                  attributes: [
                    'id',
                    'is_quantity',
                    'is_quality'
                  ]
                }
              ]
            },

            {
              model:
                TGoodReceipt,

              as: 'good_receipt',

              required: false,

              attributes: [
                'id',
                'remarks'
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
        materialReceivings.map(
          (item, index) => {

            const labels =
              item.items
                ?.flatMap(
                  (mrItem) =>
                    mrItem.labels || []
                ) || [];

            const quantityInspection =
              labels.filter(
                (label) =>
                  label.is_quantity !== null
              ).length;

            const qualityInspection =
              labels.filter(
                (label) =>
                  label.is_quantity === true &&
                  label.is_quality !== null
              ).length;

            return {

              no: index + 1,

              id: item.id,

              po_number:
                item.mdo
                  ?.mpo?.number ||
                null,

              do_number:
                item.mdo?.number ||
                null,

              supplier:
                item.mdo
                  ?.mpo?.supplier?.name ||
                null,

              label_qty_inspection:
                quantityInspection,

              label_quality_inspection:
                qualityInspection,

              gr_status:
                item.status_id === 4
                  ? 'Waiting GR Approval'
                  : 'Good Receipt',

              gr_remarks:
                item.good_receipt
                  ?.remarks || null
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

  async approve(req) {
    const t = await db.sequelize.transaction();

    try {

        const { mr_id } =
        req.params;

        const data = req.body;

        const schema = Joi.object({
        remarks: Joi.string()
            .allow('', null)
        });

        const validation =
        helper.validate(
            data,
            schema
        );

        if (!validation.status) {
        await t.rollback();
        return validation;
        }

        const value = validation.value;

        //
        // Find Material Receiving
        //

        const materialReceiving =
        await TMaterialReceiving.findByPk(
            mr_id,
            {
            attributes: [
                'id',
                'status_id'
            ],

            include: [
                {
                model:
                    TGoodReceipt,

                as: 'good_receipt',

                required: false,

                attributes: [
                    'id'
                ]
                }
            ],

            transaction: t
            }
        );

        if (!materialReceiving) {
        await t.rollback();

        return {
            status: false,
            message:
            'Material receiving not found',
            code: 404
        };
        }

        //
        // Validate Status
        //

        if (
        materialReceiving.status_id !== 4
        ) {
        await t.rollback();

        return {
            status: false,
            message:
            'Material receiving is not waiting for GR approval',
            code: 400
        };
        }

        //
        // Prevent Duplicate GR
        //

        if (
        materialReceiving.good_receipt
        ) {
        await t.rollback();

        return {
            status: false,
            message:
            'Good receipt already exists',
            code: 400
        };
        }

        //
        // Create Good Receipt
        //

        const goodReceipt =
        await TGoodReceipt.create(
            {
            mr_id:
                materialReceiving.id,

            remarks:
                value.remarks || null,

            approved_by:
                req.user.id,

            approved_at:
                new Date()
            },
            {
            transaction: t
            }
        );

        //
        // Update Status
        //

        await materialReceiving.update(
        {
            status_id: 5 // Good Receipt
        },
        {
            transaction: t
        }
        );

        await t.commit();

        return {
        status: true,
        message:
            'Good receipt has been approved successfully',

        data: {
            id:
            goodReceipt.id,

            mr_id:
            materialReceiving.id,

            status_id: 5,

            remarks:
            goodReceipt.remarks
        }
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
        message:
            'Internal server error',
        code: 500
        };
    }
    }
}

export default new GoodReceiptModule();