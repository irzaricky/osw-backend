import db from "../../models/index.js";
import { config } from "../../config/app.config.js";
import { Op } from "sequelize";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import ExcelJS from "exceljs";
import Joi from "joi";

const { SFactories, sequelize } = db;

class FactoryModule extends BaseModule {
  async getDropdown(req, res) {
    let tmp = {};
    try {
      const factories = await SFactories.findAll({
        where: { deleted_at: null },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
      });

      tmp = {
        status: true,
        code: 200,
        data: factories,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[FactoryModule][getDropdown]:`, error);
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

      const where = { deleted_at: null };

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { address: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const { count, rows } = await SFactories.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ["deleted_at"] },
        order: [["created_at", "DESC"]],
      });

      tmp = {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[FactoryModule][list]:`, error);
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
        name: Joi.string().max(100).required(),
        address: Joi.string().allow(null, ""),
        phone: Joi.string().max(20).allow(null, ""),
        maps_url: Joi.string().uri().allow(null, ""),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { name, address, phone, maps_url } = validation.value;

      const existing = await SFactories.findOne({
        where: { name },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          message: "Factory name already exists",
        };
        return helper.sendResponse(res, tmp);
      }

      let factory;

      if (existing && existing.deleted_at) {
        const oldData = existing.toJSON();
        await existing.restore({ transaction: t });

        existing.address = address ?? null;
        existing.phone = phone ?? null;
        existing.maps_url = maps_url ?? null;
        await existing.save({ transaction: t });

        factory = existing;
        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "RESTORE",
          resourceId: factory.id,
          oldData,
          newData: factory,
          description: `Restored factory with name ${name}`,
          transaction: t,
        });
      } else {
        factory = await SFactories.create(
          { name, address, phone, maps_url },
          { transaction: t }
        );

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "CREATE",
          resourceId: factory.id,
          newData: factory,
          description: `Created new factory with name ${name}`,
          transaction: t,
        });
      }

      await t.commit();

      tmp = {
        status: true,
        code: 201,
        message: "Factory created successfully",
        data: factory,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[FactoryModule][add]:`, error);
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
        name: Joi.string().max(100).required(),
        address: Joi.string().allow(null, ""),
        phone: Joi.string().max(20).allow(null, ""),
        maps_url: Joi.string().uri().allow(null, ""),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { name, address, phone, maps_url } = validation.value;

      const factory = await SFactories.findByPk(id, { transaction: t });
      if (!factory) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: "Factory not found",
        };
        return helper.sendResponse(res, tmp);
      }

      const existing = await SFactories.findOne({
        where: {
          name,
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
          message: "Factory name already exists",
        };
        return helper.sendResponse(res, tmp);
      }

      if (existing && existing.deleted_at) {
        await existing.destroy({ force: true, transaction: t });
      }

      const oldData = factory.toJSON();

      await factory.update(
        {
          name,
          address,
          phone,
          maps_url,
        },
        { transaction: t }
      );

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "UPDATE",
        resourceId: factory.id,
        oldData,
        newData: factory,
        description: `Updated factory with name ${name}`,
        transaction: t,
      });

      await t.commit();

      tmp = {
        status: true,
        code: 200,
        message: "Factory updated successfully",
        data: factory,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[FactoryModule][update]:`, error);
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

      const factory = await SFactories.findByPk(id, { transaction: t });
      if (!factory) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: "Factory not found",
        };
        return helper.sendResponse(res, tmp);
      }

      const oldData = factory.toJSON();

      await factory.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "DELETE",
        resourceId: factory.id,
        oldData,
        description: `Deleted factory with name ${factory.name}`,
        transaction: t,
      });

      await t.commit();

      tmp = {
        status: true,
        code: 200,
        message: "Factory deleted successfully",
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[FactoryModule][delete]:`, error);
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
          { address: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const factories = await SFactories.findAll({
        where,
        order: [["created_at", "DESC"]],
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Factories");

      worksheet.columns = [
        { header: "Factory Name", key: "name", width: 30 },
        { header: "Address", key: "address", width: 40 },
        { header: "Phone", key: "phone", width: 20 },
        { header: "Maps URL", key: "maps_url", width: 40 },
      ];

      worksheet.getRow(1).font = { bold: true };

      factories.forEach((factory, index) => {
        worksheet.addRow({
          name: factory.name,
          address: factory.address || "",
          phone: factory.phone || "",
          maps_url: factory.maps_url || "",
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename=factories_${new Date().toISOString()}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.log(`[FactoryModule][downloadExcel]:`, error);
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

      // Validate header row
      const EXPECTED_HEADERS = ["Factory Name", "Address", "Phone", "Maps URL"];
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

        const name = row.getCell(1).value?.toString().trim();
        const address = row.getCell(2).value?.toString() || null;
        const phone = row.getCell(3).value?.toString() || null;
        
        const mapsRaw = row.getCell(4).value;
        const maps_url = mapsRaw
          ? typeof mapsRaw === "object"
            ? mapsRaw.hyperlink || mapsRaw.text || null
            : mapsRaw.toString()
          : null;

        if (!name) {
          results.errors.push(`Row ${i}: Factory name is required`);
          results.skipped++;
          continue;
        }

        const existing = await SFactories.findOne({
          where: { name },
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

          existing.address = address ?? null;
          existing.phone = phone ?? null;
          existing.maps_url = maps_url ?? null;
          await existing.save({ transaction: t });

          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "RESTORE",
            resourceId: existing.id,
            oldData,
            newData: existing,
            description: `Restored factory via upload (${name})`,
            transaction: t,
          });

          results.restored++;
        } else {
          const factory = await SFactories.create(
            {
              name,
              address,
              phone,
              maps_url,
            },
            { transaction: t }
          );

          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "CREATE",
            resourceId: factory.id,
            newData: factory,
            description: `Created factory via upload (${name})`,
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
      console.log(`[FactoryModule][upload]:`, error);

      tmp = {
        status: false,
        code: 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }
}

export default new FactoryModule();
