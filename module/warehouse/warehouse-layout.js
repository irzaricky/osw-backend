import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const { SWarehouses, SWarehouseAreas, RefWarehouseCategories, SWarehouseLayout, SAreaLayout, SAreaSpacing, SWarehouseBins, TWarehouseStock, TWorkOrderStoringItemLabel, TPartLabels, SParts, SPackages } = db;

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
          attributes: ['id', 'name', 'warehouse_code', 'category_id'],
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
        distinct: true,
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
          warehouse_code: item.warehouse.warehouse_code,
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
            attributes: ['id','area_id', 'start_row', 'start_col'],
            include: [
              {
                model: SWarehouseAreas,
                as: 'area',
                attributes: ['id', 'area_code', 'name', 'total_rows', 'total_cols'],
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
            }))
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

  async detailAreaLayout(req) {
    try {
      const id = req.params.id;

      const areaLayout = await SAreaLayout.findByPk(id, {
        attributes: [
          'id',
          'wh_layout_id',
          'area_id',
          'start_row',
          'start_col',
          'created_at',
          'updated_at'
        ],
        include: [
          {
            model: SWarehouseAreas,
            as: 'area',
            attributes: [
              'id',
              'area_code',
              'name',
              'total_rows',
              'total_cols'
            ]
          },
          {
            model: SAreaSpacing,
            as: 'area_spacings',
            attributes: [
              'id',
              'col_index',
              'col_spacing'
            ],
            required: false
          }
        ]
      });

      if (!areaLayout) {
        return {
          status: false,
          message: 'Area layout not found',
          code: 404
        };
      }

      const mappedResult = {
        id: areaLayout.id,
        wh_layout_id: areaLayout.wh_layout_id,
        area_id: areaLayout.area_id,
        start_row: areaLayout.start_row,
        start_col: areaLayout.start_col,
        area: {
          id: areaLayout.area.id,
          area_code: areaLayout.area.area_code,
          name: areaLayout.area.name,
          total_rows: areaLayout.area.total_rows,
          total_cols: areaLayout.area.total_cols
        },
        area_spacings:
          areaLayout.area_spacings.map(item => ({
            id: item.id,
            col_index: item.col_index,
            col_spacing: item.col_spacing
          }))
      };

      return {
        status: true,
        data: mappedResult
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
      const wh_layout_id = req.params.id;
      const data = req.body;

      const schema = Joi.object({
        area_id: Joi.number().integer().required(),
        start_row: Joi.number().integer().min(1).required(),
        start_col: Joi.number().integer().min(1).required(),

        area_spacings: Joi.array().items(
          Joi.object({
            col_index: Joi.number().integer().min(1).required(),
            col_spacing: Joi.number().integer().min(0).required()
          })
        ).default([])
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { area_id, start_row, start_col, area_spacings } = validation.value;

      try {
        await helper.checkExists(SWarehouseLayout, wh_layout_id, 'Warehouse Layout', t);
        await helper.checkExists(SWarehouseAreas, area_id, 'Warehouse Area', t);
      } catch (err) {
        await t.rollback();
        return err;
      }

      const area = await SWarehouseAreas.findByPk(area_id, {
        attributes: [
          'id',
          'area_code',
          'total_rows',
          'total_cols'
        ],
        transaction: t
      });

      for (const spacing of area_spacings) {
        if (spacing.col_index > area.total_cols) {
          await t.rollback();

          return {
            status: false,
            message: `Column index ${spacing.col_index} exceeds total cols area`,
            code: 400
          };
        }
      }

      const newTotalSpacing = area_spacings.reduce((sum, item) => sum + item.col_spacing, 0);
      const newStartRow = start_row;
      const newEndRow = start_row + area.total_rows - 1;
      const newStartCol = start_col;
      const newEndCol = start_col + area.total_cols + newTotalSpacing - 1;

      const existingLayouts = await SAreaLayout.findAll({
        where: {
          wh_layout_id
        },
        include: [
          {
            model: SWarehouseAreas,
            as: 'area',
            attributes: [
              'id',
              'area_code',
              'total_rows',
              'total_cols'
            ]
          },
          {
            model: SAreaSpacing,
            as: 'area_spacings',
            attributes: [
              'id',
              'col_index',
              'col_spacing'
            ],
            required: false
          }
        ],
        transaction: t
      });

      for (const layout of existingLayouts) {
        const existingTotalSpacing = layout.area_spacings.reduce((sum, item) => sum + item.col_spacing, 0);
        const existingStartRow = layout.start_row;
        const existingEndRow = layout.start_row + layout.area.total_rows - 1;
        const existingStartCol = layout.start_col;
        const existingEndCol = layout.start_col + layout.area.total_cols + existingTotalSpacing - 1;

        const isCollide =
          newStartRow <= existingEndRow &&
          newEndRow >= existingStartRow &&
          newStartCol <= existingEndCol &&
          newEndCol >= existingStartCol;

        if (isCollide) {
          await t.rollback();
          return {
            status: false,
            message: `Area collision with ${layout.area.area_code}`,
            code: 409
          };
        }
      }

      const existingArea = await SAreaLayout.findOne({
        where: {
          wh_layout_id,
          area_id
        },
        paranoid: false,
        transaction: t
      });

      let areaLayout;

      if (existingArea && !existingArea.deleted_at) {
        await t.rollback();
        return {
          status: false,
          message: 'Area already exists in this warehouse layout',
          code: 409
        };
      }

      if (existingArea && existingArea.deleted_at) {
        await existingArea.restore({
          transaction: t
        });
        await existingArea.update({
          start_row,
          start_col
        }, {
          transaction: t
        });
        areaLayout = existingArea;
      }

      if (!existingArea) {
        areaLayout = await SAreaLayout.create({
          wh_layout_id,
          area_id,
          start_row,
          start_col
        }, {
          transaction: t
        });
      }

      for (const item of area_spacings) {
        const existingSpacing =
          await SAreaSpacing.findOne({
            where: {
              area_layout_id: areaLayout.id,
              col_index: item.col_index
            },
            paranoid: false,
            transaction: t
          });

        if (existingSpacing && !existingSpacing.deleted_at) {
          await existingSpacing.update({
            col_spacing: item.col_spacing
          }, {
            transaction: t
          });
          continue;
        }

        if (existingSpacing && existingSpacing.deleted_at) {
          await existingSpacing.restore({
            transaction: t
          });
          await existingSpacing.update({
            col_spacing: item.col_spacing
          }, {
            transaction: t
          });
          continue;
        }

        await SAreaSpacing.create({
          area_layout_id: areaLayout.id,
          col_index: item.col_index,
          col_spacing: item.col_spacing
        }, {
          transaction: t
        });
      }

      const result = await SAreaLayout.findByPk(areaLayout.id, {
        include: [
          {
            model: SWarehouseAreas,
            as: 'area'
          },
          {
            model: SAreaSpacing,
            as: 'area_spacings'
          }
        ],
        transaction: t
      });

      const mappedResult = {
        id: result.id,
        start_row: result.start_row,
        start_col: result.start_col,
        area: {
          id: result.area.id,
          area_code: result.area.area_code,
          name: result.area.name,
          total_rows: result.area.total_rows,
          total_cols: result.area.total_cols
        },
        area_spacings: result.area_spacings.map(item => ({
          id: item.id,
          col_index: item.col_index,
          col_spacing: item.col_spacing
        }))
      };

      await t.commit();

      return {
        status: true,
        message: existingArea?.deleted_at ? 'Area layout restored successfully' : 'Area layout created successfully',
        data: mappedResult
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

  async updateAreaLayout(req) {
    const t = await db.sequelize.transaction();
    try {
      const id = req.params.id;
      const data = req.body;

      const schema = Joi.object({
        start_row: Joi.number().integer().min(1).required(),
        start_col: Joi.number().integer().min(1).required(),

        area_spacings: Joi.array().items(
          Joi.object({
            col_index: Joi.number().integer().min(1).required(),
            col_spacing: Joi.number().integer().min(0).required()
          })
        ).default([])
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { start_row, start_col, area_spacings } = validation.value;

      const areaLayout = await SAreaLayout.findByPk(id, {
        include: [
          {
            model: SWarehouseAreas,
            as: 'area',
            attributes: [
              'id',
              'area_code',
              'name',
              'total_rows',
              'total_cols'
            ]
          }
        ],
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

      for (const spacing of area_spacings) {
        if (spacing.col_index > areaLayout.area.total_cols) {
          await t.rollback();

          return {
            status: false,
            message: `Column index ${spacing.col_index} exceeds total cols area`,
            code: 400
          };
        }
      }

      const newTotalSpacing = area_spacings.reduce((sum, item) => sum + item.col_spacing, 0);
      const newStartRow = start_row;
      const newEndRow = start_row + areaLayout.area.total_rows - 1;
      const newStartCol = start_col;
      const newEndCol = start_col + areaLayout.area.total_cols + newTotalSpacing - 1;

      const existingLayouts = await SAreaLayout.findAll({
        where: {
          wh_layout_id: areaLayout.wh_layout_id
        },
        include: [
          {
            model: SWarehouseAreas,
            as: 'area',
            attributes: [
              'id',
              'area_code',
              'total_rows',
              'total_cols'
            ]
          },
          {
            model: SAreaSpacing,
            as: 'area_spacings',
            attributes: [
              'id',
              'col_index',
              'col_spacing'
            ],
            required: false
          }
        ],
        transaction: t
      });

      for (const layout of existingLayouts) {
        if (layout.id === areaLayout.id) {
          continue;
        }
        const existingTotalSpacing = layout.area_spacings.reduce((sum, item) => sum + item.col_spacing, 0);
        const existingStartRow = layout.start_row;
        const existingEndRow = layout.start_row + layout.area.total_rows - 1;
        const existingStartCol = layout.start_col;
        const existingEndCol = layout.start_col + layout.area.total_cols + existingTotalSpacing - 1;

        const isCollide =
          newStartRow <= existingEndRow &&
          newEndRow >= existingStartRow &&
          newStartCol <= existingEndCol &&
          newEndCol >= existingStartCol;

        if (isCollide) {
          await t.rollback();
          return {
            status: false,
            message: `Area collision with ${layout.area.area_code}`,
            code: 409
          };
        }
      }

      await areaLayout.update({
        start_row,
        start_col
      }, {
        transaction: t
      });

      for (const item of area_spacings) {
        const existingSpacing =
          await SAreaSpacing.findOne({
            where: {
              area_layout_id: areaLayout.id,
              col_index: item.col_index
            },
            paranoid: false,
            transaction: t
          });

        if (existingSpacing && !existingSpacing.deleted_at) {
          await existingSpacing.update({
            col_spacing: item.col_spacing
          }, {
            transaction: t
          });
          continue;
        }

        if (existingSpacing && existingSpacing.deleted_at) {
          await existingSpacing.restore({
            transaction: t
          });
          await existingSpacing.update({
            col_spacing: item.col_spacing
          }, {
            transaction: t
          });
          continue;
        }

        await SAreaSpacing.create({
          area_layout_id: areaLayout.id,
          col_index: item.col_index,
          col_spacing: item.col_spacing
        }, {
          transaction: t
        });
      }

      const requestColIndexes = area_spacings.map(item => item.col_index);

      await SAreaSpacing.destroy({
        where: {
          area_layout_id: areaLayout.id,
          col_index: {
            [Op.notIn]: requestColIndexes
          }
        },
        transaction: t
      });

      const result = await SAreaLayout.findByPk(areaLayout.id, {
        include: [
          {
            model: SWarehouseAreas,
            as: 'area'
          },
          {
            model: SAreaSpacing,
            as: 'area_spacings'
          }
        ],
        transaction: t
      });

      const mappedResult = {
        id: result.id,
        start_row: result.start_row,
        start_col: result.start_col,
        area: {
          id: result.area.id,
          area_code: result.area.area_code,
          name: result.area.name,
          total_rows: result.area.total_rows,
          total_cols: result.area.total_cols
        },
        area_spacings:
          result.area_spacings.map(item => ({
            id: item.id,
            col_index: item.col_index,
            col_spacing: item.col_spacing
          }))
      };

      await t.commit();

      return {
        status: true,
        message: 'Area layout updated successfully',
        data: mappedResult
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

      await SAreaSpacing.destroy({
        where: {
          area_layout_id: areaLayout.id
        },
        transaction: t
      });

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

  async detailStorageBin(req) {
    try {
      const id = req.params.id;

      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || '';

      const bin = await SWarehouseBins.findByPk(id, {
        attributes: [
          'id',
          'bin_code',
          'capacity',
          'dedicated_part_number'
        ],
        include: [
          {
            model: SWarehouseAreas,
            as: 'area',
            attributes: [
              'id',
              'area_code',
              'name'
            ],
            include: [
              {
                model: SWarehouses,
                as: 'warehouse',
                attributes: [
                  'id',
                  'warehouse_code',
                  'name'
                ]
              }
            ]
          }
        ]
      });

      if (!bin) {
        return {
          status: false,
          message: 'Storage bin not found',
          code: 404
        };
      }

      const whereStock = {
        bin_id: id
      };

      if (search) {
        whereStock[Op.or] = [
          {
            '$work_order_item_label.label.label_number$': {
              [Op.iLike]: `%${search}%`
            }
          },
          {
            '$work_order_item_label.label.part.part_number$': {
              [Op.iLike]: `%${search}%`
            }
          },
          {
            '$work_order_item_label.label.part.part_name$': {
              [Op.iLike]: `%${search}%`
            }
          }
        ];
      }

      const { count, rows } = await TWarehouseStock.findAndCountAll({
        where: whereStock,
        limit,
        offset,
        distinct: true,
        attributes: ['id', 'createdAt'],
        include: [
          {
            model: TWorkOrderStoringItemLabel,
            as: 'work_order_item_label',
            attributes: ['id'],
            include: [
              {
                model: TPartLabels,
                as: 'label',
                attributes: ['id', 'label_number'],
                include: [
                  {
                    model: SParts,
                    as: 'part',
                    attributes: ['id', 'part_number', 'part_name'],
                    include: [
                      {
                        model: SPackages,
                        as: 'package',
                        attributes: ['id', 'capacity']
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        order: [['created_at', 'DESC']]
      });

      const mappedStocks = rows.map(item => {
        const label = item.work_order_item_label?.label;
        const part = label?.part;
        const packageData = part?.package;

        return {
          id: item.id,
          created_at: item.createdAt,
          label_number: label?.label_number || null,
          part_number: part?.part_number || null,
          part_name: part?.part_name || null,
          package_capacity: packageData?.capacity || 0
        };
      });

      return {
        status: true,
        data: {
          bin: {
            id: bin.id,
            bin_code: bin.bin_code,
            capacity: bin.capacity,
            dedicated_part_number: bin.dedicated_part_number,
            area: bin.area
              ? {
                  id: bin.area.id,
                  area_code: bin.area.area_code,
                  name: bin.area.name,
                  warehouse: bin.area.warehouse
                    ? {
                        id: bin.area.warehouse.id,
                        warehouse_code: bin.area.warehouse.warehouse_code,
                        name: bin.area.warehouse.name
                      }
                    : null
                }
              : null
          },
          stocks:
            helper.getPaginationData(
              mappedStocks,
              count,
              page,
              limit
            )
        }
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

export default new WarehouseLayoutModule();