import db from "../../models/index.js";
import { config } from "../../config/app.config.js";
import { Op } from "sequelize";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import ExcelJS from "exceljs";
import Joi from "joi";

const { SFactories, SLines, sequelize } = db;

class LineModule extends BaseModule {
  async getDropdown(req, res) {
    let tmp = {};
    try {
      const lines = await SLines.findAll({
        where: { deleted_at: null },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
      });

      tmp = {
        status: true,
        code: 200,
        data: lines,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[LineModule][getDropdown]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }
  
  async list(req, res) {
    let tmp = {};
    try {
      const params = req.query;
      const { limit, page, offset } = helper.getPagination(params);
      const search = params.search || "";
      const factory_id = params.factory_id || null;

      const where = { deleted_at: null };

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { line_code: { [Op.iLike]: `%${search}%` } },
        ];
      }

      if (factory_id) {
        where.factory_id = factory_id;
      }

      const include = [
        {
          model: SFactories,
          as: 'factory',
          attributes: ['id', 'name'],
        },
      ];

      const { count, rows } = await SLines.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ["deleted_at"] },
        include,
        order: [["created_at", "DESC"]],
      });

      tmp = {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[LineModule][list]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async add(req, res) {
    let tmp = {};
    const t = await sequelize.transaction();
    try {
      const schema = Joi.object({
        line_code: Joi.string().max(50).required(),
        name: Joi.string().max(100).required(),
        factory_id: Joi.number().integer().required(),
        sequence: Joi.number().integer().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { line_code, name, factory_id, sequence } = validation.value;

      const existing = await SLines.findOne({
        where: { line_code },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          message: "Line code already exists",
        };
        return helper.sendResponse(res, tmp);
      }

      const existingFactory = await SFactories.findByPk(factory_id, { transaction: t });
      if (!existingFactory) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: "Factory not found",
        };
        return helper.sendResponse(res, tmp);
      }

      let line;

      if (existing && existing.deleted_at) {
        const oldData = existing.toJSON();
        await existing.restore({ transaction: t });

        existing.name = name ?? null;
        existing.factory_id = factory_id ?? null;
        existing.sequence = sequence ?? null;
        await existing.save({ transaction: t });

        line = existing;
        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "RESTORE",
          resourceId: existing.id,
          oldData,
          newData: existing,
          description: `Restored line with name ${name}`,
          transaction: t,
        });
      } else {
        line = await SLines.create(
          { line_code, name, factory_id, sequence },
          { transaction: t }
        );

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "CREATE",
          resourceId: line.id,
          newData: line,
          description: `Created new line with name ${name}`,
          transaction: t,
        });
      }

      await t.commit();

      tmp = {
        status: true,
        code: 201,
        message: "Line created successfully",
        data: line,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[LineModule][add]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async update(req, res) {
    let tmp = {};
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const schema = Joi.object({
        line_code: Joi.string().max(50).required(),
        name: Joi.string().max(100).required(),
        factory_id: Joi.number().integer().required(),
        sequence: Joi.number().integer().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { line_code, name, factory_id, sequence } = validation.value;

      const line = await SLines.findByPk(id, { transaction: t });
      if (!line) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: "Line not found",
        };
        return helper.sendResponse(res, tmp);
      }

      const existing = await SLines.findOne({
        where: {
          line_code,
          id: { [Op.ne]: id },
        },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          message: "Line code already exists",
        };
        return helper.sendResponse(res, tmp);
      }

      if (existing && existing.deleted_at) {
        await existing.destroy({ force: true, transaction: t });
      }

      const existingFactory = await SFactories.findByPk(factory_id, { transaction: t });
      if (!existingFactory) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: "Factory not found",
        };
        return helper.sendResponse(res, tmp);
      }

      const oldData = line.toJSON();

      await line.update(
        {
          line_code,
          name,
          factory_id,
          sequence,
        },
        { transaction: t }
      );

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "UPDATE",
        resourceId: line.id,
        oldData,
        newData: line,
        description: `Updated line with code ${line_code}`,
        transaction: t,
      });

      await t.commit();

      tmp = {
        status: true,
        code: 200,
        message: "Line updated successfully",
        data: line,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[LineModule][update]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async delete(req, res) {
    let tmp = {};
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const line = await SLines.findByPk(id, { transaction: t });
      if (!line) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: "Line not found",
        };
        return helper.sendResponse(res, tmp);
      }

      const oldData = line.toJSON();

      await line.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "DELETE",
        resourceId: line.id,
        oldData,
        description: `Deleted line with name ${line.name}`,
        transaction: t,
      });

      await t.commit();

      tmp = {
        status: true,
        code: 200,
        message: "Line deleted successfully",
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[LineModule][delete]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async download(req, res) {
    try {
      const params = req.query;
      const search = params.search || "";

      const where = { deleted_at: null };

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { line_code: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const lines = await SLines.findAll({
        where,
        include: [
          {
            model: SFactories,
            as: "factory",
            attributes: ["name"],
          },
        ],
        order: [["created_at", "DESC"]],
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Lines");

      worksheet.columns = [
        { header: "Line Code", key: "line_code", width: 20 },
        { header: "Line Name", key: "name", width: 30 },
        { header: "Factory Name", key: "factory", width: 30 },
        { header: "Sequence", key: "sequence", width: 15 },
      ];

      worksheet.getRow(1).font = { bold: true };

      lines.forEach((line) => {
        worksheet.addRow({
          line_code: line.line_code,
          name: line.name,
          factory: line.factory?.name || "",
          sequence: line.sequence,
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename=lines_${new Date().toISOString()}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.log(`[LineModule][download]:`, error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || "Internal Server Error",
      });
    }
  }

  async upload(req, res) {
    let tmp = {};
    const t = await sequelize.transaction();

    try {
      if (!req.files?.file) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: "File is required",
        });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.files.file.data);

      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: "Invalid Excel format",
        });
      }

      const EXPECTED_HEADERS = ["Line Code", "Line Name", "Factory Name", "Sequence"];
      const headerRow = worksheet.getRow(1);
      const actualHeaders = EXPECTED_HEADERS.map((_, i) =>
        headerRow.getCell(i + 1).value?.toString().trim() ?? ""
      );

      const isValidTemplate = EXPECTED_HEADERS.every(
        (expected, i) => actualHeaders[i].toLowerCase() === expected.toLowerCase()
      );

      if (!isValidTemplate) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: `Invalid template. Expected headers: [${EXPECTED_HEADERS.join(", ")}], but got: [${actualHeaders.join(", ")}]`,
        });
      }

      let results = {
        created: 0,
        restored: 0,
        skipped: 0,
        errors: [],
      };

      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);

        const line_code = row.getCell(1).value?.toString().trim();
        const name = row.getCell(2).value?.toString().trim();
        const factory_name = row.getCell(3).value?.toString().trim();
        const sequence = parseInt(row.getCell(4).value) || 0;

        if (!line_code) {
          results.errors.push(`Row ${i}: Line code is required`);
          results.skipped++;
          continue;
        }

        if (!name) {
          results.errors.push(`Row ${i}: Line name is required`);
          results.skipped++;
          continue;
        }

        // Lookup factory by name
        const factory = factory_name
          ? await SFactories.findOne({
              where: { name: factory_name, deleted_at: null },
              transaction: t,
            })
          : null;

        if (!factory) {
          results.errors.push(`Row ${i}: Factory "${factory_name}" not found`);
          results.skipped++;
          continue;
        }

        const existing = await SLines.findOne({
          where: { line_code },
          paranoid: false,
          transaction: t,
        });

        if (existing && !existing.deleted_at) {
          results.skipped++;
          continue;
        }

        if (existing && existing.deleted_at) {
          const oldData = existing.toJSON();
          await existing.restore({ transaction: t });

          existing.name = name;
          existing.factory_id = factory.id;
          existing.sequence = sequence;
          await existing.save({ transaction: t });

          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "RESTORE",
            resourceId: existing.id,
            oldData,
            newData: existing,
            description: `Restored line via upload (${line_code})`,
            transaction: t,
          });

          results.restored++;
        } else {
          const line = await SLines.create(
            { line_code, name, factory_id: factory.id, sequence },
            { transaction: t }
          );

          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "CREATE",
            resourceId: line.id,
            newData: line,
            description: `Created line via upload (${line_code})`,
            transaction: t,
          });

          results.created++;
        }
      }

      await t.commit();

      tmp = {
        status: true,
        code: 200,
        message: "Upload completed",
        data: results,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[LineModule][upload]:`, error);

      tmp = {
        status: false,
        code: 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }
}

export default new LineModule();
