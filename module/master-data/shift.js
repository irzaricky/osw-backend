import db from "../../models/index.js";
import { Op } from "sequelize";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import ExcelJS from "exceljs";
import Joi from "joi";

const { SShifts, RefTypeCalendars, sequelize } = db;

const SHIFT_TYPES = ["REGULAR", "NON REGULAR"];
const SHIFT_CATEGORIES = ["PRODUCTIVE", "BREAK"];

class ShiftModule extends BaseModule {
  async getTypes(req, res) {
    let tmp = {};
    try {
      const data = SHIFT_TYPES.map((t) => ({ id: t, name: t }));
      tmp = { status: true, code: 200, data };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[ShiftModule][getTypes]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async getCategories(req, res) {
    let tmp = {};
    try {
      const data = SHIFT_CATEGORIES.map((c) => ({ id: c, name: c }));
      tmp = { status: true, code: 200, data };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[ShiftModule][getCategories]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async getDropdown(req, res) {
    let tmp = {};
    try {
      const shifts = await SShifts.findAll({
        where: { deleted_at: null, active: true },
        attributes: [
          "id",
          "name",
          "shift_number",
          "type",
          "category",
          "start_time",
          "end_time",
        ],
        order: [
          ["shift_number", "ASC"],
          ["start_time", "ASC"],
        ],
      });
      tmp = { status: true, code: 200, data: shifts };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[ShiftModule][getDropdown]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
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
          { description: { [Op.iLike]: `%${search}%` } },
        ];
      }

      if (params.type) where.type = params.type;
      if (params.category) where.category = params.category;
      if (params.shift_number) where.shift_number = Number(params.shift_number);
      if (params.active !== undefined) where.active = params.active === "true";

      const { count, rows } = await SShifts.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ["deleted_at"] },
        order: [
          ["shift_number", "ASC"],
          ["start_time", "ASC"],
        ],
      });

      tmp = {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[ShiftModule][list]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
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
        shift_number: Joi.number().integer().required(),
        type: Joi.string()
          .valid(...SHIFT_TYPES)
          .required(),
        start_time: Joi.string()
          .pattern(/^\d{2}:\d{2}(:\d{2})?$/)
          .required(),
        end_time: Joi.string()
          .pattern(/^\d{2}:\d{2}(:\d{2})?$/)
          .required(),
        category: Joi.string()
          .valid(...SHIFT_CATEGORIES)
          .required(),
        description: Joi.string().allow("", null).optional(),
        active: Joi.boolean().default(true),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const {
        name,
        shift_number,
        type,
        start_time,
        end_time,
        category,
        description,
        active,
      } = validation.value;

      const existing = await SShifts.findOne({
        where: { shift_number, type },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          error: "Shift with this number and type already exists",
        };
        return helper.sendResponse(res, tmp);
      }

      let shift;

      if (existing && existing.deleted_at) {
        const oldData = existing.toJSON();
        await existing.restore({ transaction: t });
        existing.name = name;
        existing.shift_number = shift_number;
        existing.type = type;
        existing.start_time = start_time;
        existing.end_time = end_time;
        existing.category = category;
        existing.description = description ?? null;
        existing.active = active;
        await existing.save({ transaction: t });
        shift = existing;

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "RESTORE",
          resourceId: shift.id,
          oldData,
          newData: shift,
          description: `Restored shift ${name}`,
          transaction: t,
        });
      } else {
        shift = await SShifts.create(
          {
            name,
            shift_number,
            type,
            start_time,
            end_time,
            category,
            description,
            active,
          },
          { transaction: t }
        );

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "CREATE",
          resourceId: shift.id,
          newData: shift,
          description: `Created shift ${name}`,
          transaction: t,
        });
      }

      await t.commit();
      tmp = {
        status: true,
        code: 201,
        message: "Shift created successfully",
        data: shift,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[ShiftModule][add]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
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
        shift_number: Joi.number().integer().required(),
        type: Joi.string()
          .valid(...SHIFT_TYPES)
          .required(),
        start_time: Joi.string()
          .pattern(/^\d{2}:\d{2}(:\d{2})?$/)
          .required(),
        end_time: Joi.string()
          .pattern(/^\d{2}:\d{2}(:\d{2})?$/)
          .required(),
        category: Joi.string()
          .valid(...SHIFT_CATEGORIES)
          .required(),
        description: Joi.string().allow("", null).optional(),
        active: Joi.boolean().default(true),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const {
        name,
        shift_number,
        type,
        start_time,
        end_time,
        category,
        description,
        active,
      } = validation.value;

      const shift = await SShifts.findByPk(id, { transaction: t });
      if (!shift) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Shift not found" };
        return helper.sendResponse(res, tmp);
      }

      // cek duplikat shift_number + type di record lain (termasuk soft-deleted)
      const duplicate = await SShifts.findOne({
        where: { shift_number, type, id: { [Op.ne]: id } },
        paranoid: false,
        transaction: t,
      });

      if (duplicate && !duplicate.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          error: "Shift with this number and type already exists",
        };
        return helper.sendResponse(res, tmp);
      }

      if (duplicate && duplicate.deleted_at) {
        await duplicate.destroy({ force: true, transaction: t });
      }

      const oldData = shift.toJSON();
      await shift.update(
        {
          name,
          shift_number,
          type,
          start_time,
          end_time,
          category,
          description,
          active,
        },
        { transaction: t }
      );

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "UPDATE",
        resourceId: shift.id,
        oldData,
        newData: shift,
        description: `Updated shift ${name}`,
        transaction: t,
      });

      await t.commit();
      tmp = {
        status: true,
        code: 200,
        message: "Shift updated successfully",
        data: shift,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[ShiftModule][update]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async delete(req, res) {
    let tmp = {};
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const shift = await SShifts.findByPk(id, { transaction: t });
      if (!shift) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Shift not found" };
        return helper.sendResponse(res, tmp);
      }

      const oldData = shift.toJSON();
      await shift.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "DELETE",
        resourceId: shift.id,
        oldData,
        description: `Deleted shift ${shift.name}`,
        transaction: t,
      });

      await t.commit();
      tmp = { status: true, code: 200, message: "Shift deleted successfully" };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[ShiftModule][delete]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
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
          { description: { [Op.iLike]: `%${search}%` } },
        ];
      }

      if (params.type) where.type = params.type;
      if (params.category) where.category = params.category;

      const shifts = await SShifts.findAll({
        where,
        attributes: { exclude: ["deleted_at"] },
        order: [
          ["shift_number", "ASC"],
          ["start_time", "ASC"],
        ],
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Shifts");

      worksheet.columns = [
        { header: "Name", key: "name", width: 30 },
        { header: "Shift Number", key: "shift_number", width: 15 },
        { header: "Type", key: "type", width: 15 },
        { header: "Start Time", key: "start_time", width: 15 },
        { header: "End Time", key: "end_time", width: 15 },
        { header: "Category", key: "category", width: 15 },
        { header: "Description", key: "description", width: 40 },
        { header: "Active", key: "active", width: 12 },
      ];
      worksheet.getRow(1).font = { bold: true };

      shifts.forEach((s) => {
        worksheet.addRow({
          name: s.name,
          shift_number: s.shift_number,
          type: s.type,
          start_time: s.start_time,
          end_time: s.end_time,
          category: s.category,
          description: s.description || "",
          active: s.active ? "Active" : "Inactive",
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=shifts_${Date.now()}.xlsx`
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.log(`[ShiftModule][download]:`, error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
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
          error: "File is required",
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
          error: "Invalid Excel format",
        });
      }

      const EXPECTED_HEADERS = [
        "Name",
        "Shift Number",
        "Type",
        "Start Time",
        "End Time",
        "Category",
        "Description",
        "Active",
      ];
      const headerRow = worksheet.getRow(1);
      const actualHeaders = EXPECTED_HEADERS.map(
        (_, i) =>
          headerRow
            .getCell(i + 1)
            .value?.toString()
            .trim() ?? ""
      );
      const isValid = EXPECTED_HEADERS.every(
        (h, i) => actualHeaders[i].toLowerCase() === h.toLowerCase()
      );
      if (!isValid) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          error: `Invalid template. Expected: [${EXPECTED_HEADERS.join(
            ", "
          )}], got: [${actualHeaders.join(", ")}]`,
        });
      }

      const results = { created: 0, restored: 0, skipped: 0, errors: [] };

      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        const name = row.getCell(1).value?.toString().trim();
        const shift_number = parseInt(row.getCell(2).value) || null;
        const type = row.getCell(3).value?.toString().trim();
        const start_time = row.getCell(4).value?.toString().trim();
        const end_time = row.getCell(5).value?.toString().trim();
        const category = row.getCell(6).value?.toString().trim();
        const description = row.getCell(7).value?.toString().trim() || null;
        const active =
          row.getCell(8).value?.toString().trim().toLowerCase() !== "inactive";

        if (!name) {
          results.errors.push(`Row ${i}: Name is required`);
          results.skipped++;
          continue;
        }
        if (!shift_number) {
          results.errors.push(`Row ${i}: Shift number is required`);
          results.skipped++;
          continue;
        }
        if (!SHIFT_TYPES.includes(type)) {
          results.errors.push(
            `Row ${i}: Invalid type "${type}". Must be one of: ${SHIFT_TYPES.join(
              ", "
            )}`
          );
          results.skipped++;
          continue;
        }
        if (!SHIFT_CATEGORIES.includes(category)) {
          results.errors.push(
            `Row ${i}: Invalid category "${category}". Must be one of: ${SHIFT_CATEGORIES.join(
              ", "
            )}`
          );
          results.skipped++;
          continue;
        }
        if (!start_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(start_time)) {
          results.errors.push(`Row ${i}: Invalid start time format. Use HH:MM`);
          results.skipped++;
          continue;
        }
        if (!end_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(end_time)) {
          results.errors.push(`Row ${i}: Invalid end time format. Use HH:MM`);
          results.skipped++;
          continue;
        }

        const existing = await SShifts.findOne({
          where: { shift_number, type },
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
          existing.shift_number = shift_number;
          existing.type = type;
          existing.start_time = start_time;
          existing.end_time = end_time;
          existing.category = category;
          existing.description = description;
          existing.active = active;
          await existing.save({ transaction: t });

          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "RESTORE",
            resourceId: existing.id,
            oldData,
            newData: existing,
            description: `Restored shift via upload (${name})`,
            transaction: t,
          });
          results.restored++;
        } else {
          const shift = await SShifts.create(
            {
              name,
              shift_number,
              type,
              start_time,
              end_time,
              category,
              description,
              active,
            },
            { transaction: t }
          );

          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "CREATE",
            resourceId: shift.id,
            newData: shift,
            description: `Created shift via upload (${name})`,
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
      console.log(`[ShiftModule][upload]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }
}

export default new ShiftModule();
