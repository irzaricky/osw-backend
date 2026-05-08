import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const { SWarehouses, SWarehouseAreas, RefWarehouseCategories, SWarehouseLayout, SAreaLayout, SAreaSpacing, SWarehouseBins, TWarehouseStock } = db;

class WarehouseLayoutModule extends BaseModule {
  async list(req) {
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';

      const include = [
        {
          model: SWarehouses,
          as: 'warehouse',
          attributes: ['id', 'name', 'warehouse_code'],
          where: search
            ? {
              [Op.or]: [
                {
                  name: { [Op.iLike]: `%${search}%` }
                },
                {
                  warehouse_code: { [Op.iLike]: `%${search}%` }
                }
              ]
            }
            : undefined,
          include: [
            {
              model: RefWarehouseCategories,
              as: 'category',
              attributes: ['id', 'name']
            },
            {
              model: SWarehouseAreas,
              as: 'areas',
              attributes: ['id']
            }
          ]
        },
        {
          model: SAreaLayout,
          as: 'area_layouts',
          attributes: ['id']
        }
      ];

      const { count, rows } = await SWarehouseLayout.findAndCountAll({
        limit,
        offset,
        attributes: { exclude: ['warehouse_id', 'deleted_at'] },
        include,
        order: [['created_at', 'DESC']]
      });

      const mappedRows = rows.map((item) => ({
        id: item.id,

        warehouse: {
          id: item.warehouse.id,
          code: item.warehouse.warehouse_code,
          name: item.warehouse.name,
          category: item.warehouse.category
            ? {
                id: item.warehouse.category.id,
                name: item.warehouse.category.name
              }
            : null
        },
        placed_area_count: item.area_layouts.length,
        total_area_count: item.warehouse.areas.length
      }));

      return {
        status: true,
        data: helper.getPaginationData(mappedRows, count, page, limit)
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
        warehouse_id: Joi.number().integer().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { warehouse_id } = validation.value;

      try {
        await helper.checkExists(SWarehouses, warehouse_id, 'Warehouse', t);
      } catch (err) {
        await t.rollback();
        return err;
      }

      const existing = await SWarehouseLayout.findOne({
        where: { warehouse_id },
        paranoid: false,
        transaction: t
      });

      if (existing) {
        await t.rollback();
        return {
          status: false,
          message: 'Warehouse layout already exists',
          code: 409
        };
      }

      const layout = await SWarehouseLayout.create({
        warehouse_id
      }, { transaction: t });

      await t.commit();

      return {
        status: true,
        message: 'Warehouse layout created successfully',
        data: layout
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

  async detail(req) {
    try {
      const id = req.params.id;

      const layout = await SWarehouseLayout.findByPk(id, {
        attributes: { exclude: ['warehouse_id', 'deleted_at'] },
        include: [
          {
            model: SWarehouses,
            as: 'warehouse',
            attributes: ['id', 'name', 'warehouse_code'],
            include: [
              {
                model: RefWarehouseCategories,
                as: 'category',
                attributes: ['id', 'name']
              }
            ]
          },
          {
            model: SAreaLayout,
            as: 'area_layouts',
            attributes: ['id', 'start_row', 'start_col'],
            include: [
              {
                model: SWarehouseAreas,
                as: 'area',
                attributes: ['id', 'area_code', 'total_rows', 'total_cols'],
                include: [
                  {
                    model: SWarehouseBins,
                    as: 'bins',
                    attributes: ['id', 'bin_code', 'capacity', 'row_index', 'col_index'],
                    include: [
                      {
                        model: TWarehouseStock,
                        as: 'stocks',
                        attributes: ['id'],
                        required: false
                      }
                    ]
                  },
                  {
                    model: SAreaSpacing,
                    as: 'area_spacings',
                    attributes: ['id', 'col_index', 'col_spacing'],
                    required: false
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!layout) {
        return {
          status: false,
          message: 'Warehouse layout not found',
          code: 404
        };
      }

      const mappedLayout = {
        ...layout.toJSON(),
        area_layouts: layout.area_layouts.map(areaLayout => ({
          ...areaLayout.toJSON(),
          area: {
            ...areaLayout.area.toJSON(),
            bins: areaLayout.area.bins.map(bin => ({
              id: bin.id,
              bin_code: bin.bin_code,
              capacity: bin.capacity,
              row_index: bin.row_index,
              col_index: bin.col_index,
              stock_count: bin.stocks ? bin.stocks.length : 0,
              filled_percentage: bin.capacity > 0 ? Math.round((bin.stocks ? bin.stocks.length : 0) / bin.capacity * 100) : 0
            })),
            area_spacings: areaLayout.area.area_spacings || []
          }
        }))
      };

      return {
        status: true,
        data: mappedLayout
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

  async addAreaLayout(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;
      const wh_layout_id = req.params.id;

      const schema = Joi.object({
        area_id: Joi.number().integer().required(),
        start_row: Joi.number().integer().required(),
        start_col: Joi.number().integer().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { area_id, start_row, start_col } = validation.value;

      try {
        await helper.checkExists(SWarehouseLayout, wh_layout_id, 'Warehouse Layout', t);
        await helper.checkExists(SWarehouseAreas, area_id, 'Warehouse Area', t);
      } catch (err) {
        await t.rollback();
        return err;
      }

      const existing = await SAreaLayout.findOne({
        where: { wh_layout_id, area_id },
        paranoid: false,
        transaction: t
      });

      let areaLayout;

      if (existing && existing.deleted_at) {
        await existing.restore({ transaction: t });
        await existing.update({
          start_row,
          start_col
        }, { transaction: t });
        areaLayout = existing;
      } else if (existing && !existing.deleted_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Area layout already exists for this warehouse layout and area',
          code: 409
        };
      } else {
        areaLayout = await SAreaLayout.create({
          wh_layout_id,
          area_id,
          start_row,
          start_col
        }, { transaction: t });
      }

      await t.commit();

      return {
        status: true,
        message: existing && existing.deleted_at ? 'Area layout restored and updated successfully' : 'Area layout created successfully',
        data: areaLayout
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

  async addAreaSpacing(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;

      const schema = Joi.object({
        area_id: Joi.number().integer().required(),
        col_index: Joi.number().integer().required(),
        col_spacing: Joi.number().integer().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { area_id, col_index, col_spacing } = validation.value;

      try {
        await helper.checkExists(SWarehouseAreas, area_id, 'Warehouse Area', t);
      } catch (err) {
        await t.rollback();
        return err;
      }

      const existing = await SAreaSpacing.findOne({
        where: { area_id, col_index },
        paranoid: false,
        transaction: t
      });

      let areaSpacing;

      if (existing && existing.deleted_at) {
        await existing.restore({ transaction: t });
        await existing.update({
          col_spacing
        }, { transaction: t });
        areaSpacing = existing;
      } else if (existing && !existing.deleted_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Area spacing already exists for this area and column index',
          code: 409
        };
      } else {
        areaSpacing = await SAreaSpacing.create({
          area_id,
          col_index,
          col_spacing
        }, { transaction: t });
      }

      await t.commit();

      return {
        status: true,
        message: existing && existing.deleted_at ? 'Area spacing restored and updated successfully' : 'Area spacing created successfully',
        data: areaSpacing
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

  async moveAreaLayout(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;
      const data = req.body;

      const schema = Joi.object({
        start_row: Joi.number().integer().required(),
        start_col: Joi.number().integer().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { start_row, start_col } = validation.value;

      const areaLayout = await SAreaLayout.findByPk(id, {
        transaction: t
      });

      if (!areaLayout) {
        await t.rollback();
        return {
          status: false,
          message: 'Area layout not found',
          code: 404
        };
      }

      await areaLayout.update(
        { start_row, start_col },
        { transaction: t }
      );

      await t.commit();

      return {
        status: true,
        message: 'Area layout moved successfully',
        data: areaLayout
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

  async updateAreaSpacing(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;
      const data = req.body;

      const schema = Joi.object({
        col_spacing: Joi.number().integer().required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { col_spacing } = validation.value;

      const spacing = await SAreaSpacing.findByPk(id, {
        transaction: t
      });

      if (!spacing) {
        await t.rollback();
        return {
          status: false,
          message: 'Area spacing not found',
          code: 404
        };
      }

      await spacing.update(
        { col_spacing },
        { transaction: t }
      );

      await t.commit();

      return {
        status: true,
        message: 'Area spacing updated successfully',
        data: spacing
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

  async deleteAreaLayout(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;

      const areaLayout = await SAreaLayout.findByPk(id, {
        transaction: t
      });

      if (!areaLayout) {
        await t.rollback();
        return {
          status: false,
          message: 'Area layout not found',
          code: 404
        };
      }

      await areaLayout.destroy({ transaction: t });

      await t.commit();

      return {
        status: true,
        message: 'Area layout deleted successfully'
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

  async deleteAreaSpacing(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;

      const spacing = await SAreaSpacing.findByPk(id, {
        transaction: t
      });

      if (!spacing) {
        await t.rollback();
        return {
          status: false,
          message: 'Area spacing not found',
          code: 404
        };
      }

      await spacing.destroy({ transaction: t });

      await t.commit();

      return {
        status: true,
        message: 'Area spacing deleted successfully'
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
}

export default new WarehouseLayoutModule();