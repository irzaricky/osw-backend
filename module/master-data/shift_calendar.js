import db from "../../models/index.js";
import { Op } from "sequelize";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import ExcelJS from "exceljs";
import Joi from "joi";

const { SShiftCalendars, SShifts, SLines, RefTypeCalendars, sequelize } = db;

const INCLUDE = [
  {
    model: SShifts,
    as: "shift",
    attributes: ["id", "name", "shift_number", "type", "category"],
  },
  { model: SLines, as: "line", attributes: ["id", "name"] },
  { model: RefTypeCalendars, as: "type_calendar", attributes: ["id", "name"] },
];

class ShiftCalendarModule extends BaseModule {
  async getDdCalendarType(req, res) {
    let tmp = {};
    try {
      const data = await RefTypeCalendars.findAll({
        where: { deleted_at: null },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
      });
      tmp = { status: true, code: 200, data };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[ShiftCalendarModule][getDdCalendarType]:`, error);
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
        where[Op.or] = [{ date_event: { [Op.iLike]: `%${search}%` } }];
      }

      if (params.shift_id) where.shift_id = Number(params.shift_id);
      if (params.line_id) where.line_id = Number(params.line_id);
      if (params.ref_type_calendar_id)
        where.ref_type_calendar_id = Number(params.ref_type_calendar_id);
      if (params.active !== undefined) where.active = params.active === "true";
      if (params.start_date) where.start_date = { [Op.gte]: params.start_date };
      if (params.end_date) where.end_date = { [Op.lte]: params.end_date };

      const { count, rows } = await SShiftCalendars.findAndCountAll({
        where,
        limit,
        offset,
        include: INCLUDE,
        attributes: { exclude: ["deleted_at"] },
        order: [
          ["start_date", "ASC"],
          ["line_id", "ASC"],
        ],
      });

      tmp = {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[ShiftCalendarModule][list]:`, error);
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
        shift_id: Joi.number().integer().required(),
        line_id: Joi.number().integer().required(),
        ref_type_calendar_id: Joi.number().integer().required(),
        start_date: Joi.date().iso().required(),
        end_date: Joi.date().iso().min(Joi.ref("start_date")).required(),
        date_event: Joi.string().max(100).required(),
        active: Joi.boolean().default(true),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const {
        shift_id,
        line_id,
        ref_type_calendar_id,
        start_date,
        end_date,
        date_event,
        active,
      } = validation.value;

      // validasi FK
      const shift = await SShifts.findByPk(shift_id, { transaction: t });
      if (!shift) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Shift not found" };
        return helper.sendResponse(res, tmp);
      }

      const line = await SLines.findByPk(line_id, { transaction: t });
      if (!line) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Line not found" };
        return helper.sendResponse(res, tmp);
      }

      const calendarType = await RefTypeCalendars.findOne({
        where: { id: ref_type_calendar_id, deleted_at: null },
        transaction: t,
      });
      if (!calendarType) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Calendar type not found" };
        return helper.sendResponse(res, tmp);
      }

      // cek ghost record
      const ghost = await SShiftCalendars.findOne({
        where: {
          shift_id,
          line_id,
          start_date,
          end_date,
          deleted_at: { [Op.ne]: null },
        },
        paranoid: false,
        transaction: t,
      });

      let calendar;

      if (ghost) {
        const oldData = ghost.toJSON();
        await ghost.restore({ transaction: t });
        ghost.ref_type_calendar_id = ref_type_calendar_id;
        ghost.date_event = date_event;
        ghost.active = active;
        await ghost.save({ transaction: t });
        calendar = ghost;

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "RESTORE",
          resourceId: calendar.id,
          oldData,
          newData: calendar,
          description: `Restored shift calendar ${date_event}`,
          transaction: t,
        });
      } else {
        calendar = await SShiftCalendars.create(
          {
            shift_id,
            line_id,
            ref_type_calendar_id,
            start_date,
            end_date,
            date_event,
            active,
          },
          { transaction: t }
        );

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "CREATE",
          resourceId: calendar.id,
          newData: calendar,
          description: `Created shift calendar ${date_event}`,
          transaction: t,
        });
      }

      await t.commit();
      tmp = {
        status: true,
        code: 201,
        message: "Shift calendar created successfully",
        data: calendar,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[ShiftCalendarModule][add]:`, error);
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
        shift_id: Joi.number().integer().required(),
        line_id: Joi.number().integer().required(),
        ref_type_calendar_id: Joi.number().integer().required(),
        start_date: Joi.date().iso().required(),
        end_date: Joi.date().iso().min(Joi.ref("start_date")).required(),
        date_event: Joi.string().max(100).required(),
        active: Joi.boolean().default(true),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const {
        shift_id,
        line_id,
        ref_type_calendar_id,
        start_date,
        end_date,
        date_event,
        active,
      } = validation.value;

      const calendar = await SShiftCalendars.findByPk(id, { transaction: t });
      if (!calendar) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Shift calendar not found" };
        return helper.sendResponse(res, tmp);
      }

      // validasi FK
      const shift = await SShifts.findByPk(shift_id, { transaction: t });
      if (!shift) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Shift not found" };
        return helper.sendResponse(res, tmp);
      }

      const line = await SLines.findByPk(line_id, { transaction: t });
      if (!line) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Line not found" };
        return helper.sendResponse(res, tmp);
      }

      const calendarType = await RefTypeCalendars.findOne({
        where: { id: ref_type_calendar_id, deleted_at: null },
        transaction: t,
      });
      if (!calendarType) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Calendar type not found" };
        return helper.sendResponse(res, tmp);
      }

      const oldData = calendar.toJSON();
      await calendar.update(
        {
          shift_id,
          line_id,
          ref_type_calendar_id,
          start_date,
          end_date,
          date_event,
          active,
        },
        { transaction: t }
      );

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "UPDATE",
        resourceId: calendar.id,
        oldData,
        newData: calendar,
        description: `Updated shift calendar ${date_event}`,
        transaction: t,
      });

      await t.commit();
      tmp = {
        status: true,
        code: 200,
        message: "Shift calendar updated successfully",
        data: calendar,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[ShiftCalendarModule][update]:`, error);
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

      const calendar = await SShiftCalendars.findByPk(id, { transaction: t });
      if (!calendar) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Shift calendar not found" };
        return helper.sendResponse(res, tmp);
      }

      const oldData = calendar.toJSON();
      await calendar.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "DELETE",
        resourceId: calendar.id,
        oldData,
        description: `Deleted shift calendar ${calendar.date_event}`,
        transaction: t,
      });

      await t.commit();
      tmp = {
        status: true,
        code: 200,
        message: "Shift calendar deleted successfully",
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[ShiftCalendarModule][delete]:`, error);
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
      const where = { deleted_at: null };

      if (params.shift_id) where.shift_id = Number(params.shift_id);
      if (params.line_id) where.line_id = Number(params.line_id);
      if (params.ref_type_calendar_id)
        where.ref_type_calendar_id = Number(params.ref_type_calendar_id);
      if (params.active !== undefined) where.active = params.active === "true";
      if (params.start_date) where.start_date = { [Op.gte]: params.start_date };
      if (params.end_date) where.end_date = { [Op.lte]: params.end_date };

      const calendars = await SShiftCalendars.findAll({
        where,
        include: INCLUDE,
        order: [
          ["start_date", "ASC"],
          ["line_id", "ASC"],
        ],
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Shift Calendars");

      worksheet.columns = [
        { header: "Shift", key: "shift", width: 30 },
        { header: "Line", key: "line", width: 25 },
        { header: "Calendar Type", key: "calendar_type", width: 25 },
        { header: "Event Name", key: "date_event", width: 40 },
        { header: "Start Date", key: "start_date", width: 15 },
        { header: "End Date", key: "end_date", width: 15 },
        { header: "Active", key: "active", width: 12 },
      ];
      worksheet.getRow(1).font = { bold: true };

      calendars.forEach((c) => {
        worksheet.addRow({
          shift: c.shift ? `${c.shift.shift_number} – ${c.shift.name}` : "",
          line: c.line?.name || "",
          calendar_type: c.calendar_type?.name || "",
          date_event: c.date_event,
          start_date: c.start_date,
          end_date: c.end_date,
          active: c.active ? "Active" : "Inactive",
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=shift_calendars_${Date.now()}.xlsx`
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.log(`[ShiftCalendarModule][download]:`, error);
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
        "Shift",
        "Line",
        "Calendar Type",
        "Event Name",
        "Start Date",
        "End Date",
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

        // kolom 1: "shift_number – shift_name" atau nama shift saja
        const shift_raw = row.getCell(1).value?.toString().trim();
        const line_name = row.getCell(2).value?.toString().trim();
        const cal_type_name = row.getCell(3).value?.toString().trim();
        const date_event = row.getCell(4).value?.toString().trim();
        const start_date_raw = row.getCell(5).value;
        const end_date_raw = row.getCell(6).value;
        const active =
          row.getCell(7).value?.toString().trim().toLowerCase() !== "inactive";

        if (!shift_raw) {
          results.errors.push(`Row ${i}: Shift is required`);
          results.skipped++;
          continue;
        }
        if (!line_name) {
          results.errors.push(`Row ${i}: Line is required`);
          results.skipped++;
          continue;
        }
        if (!cal_type_name) {
          results.errors.push(`Row ${i}: Calendar type is required`);
          results.skipped++;
          continue;
        }
        if (!date_event) {
          results.errors.push(`Row ${i}: Event name is required`);
          results.skipped++;
          continue;
        }
        if (!start_date_raw || !end_date_raw) {
          results.errors.push(`Row ${i}: Start date and end date are required`);
          results.skipped++;
          continue;
        }

        const start_date = new Date(start_date_raw);
        const end_date = new Date(end_date_raw);

        if (isNaN(start_date) || isNaN(end_date)) {
          results.errors.push(`Row ${i}: Invalid date format`);
          results.skipped++;
          continue;
        }

        if (end_date < start_date) {
          results.errors.push(`Row ${i}: End date must be after start date`);
          results.skipped++;
          continue;
        }

        // resolve shift — support "shift_number – name" atau nama saja
        const shiftNumberMatch = shift_raw.match(/^(\d+)\s*[–-]/);
        const shiftWhere = shiftNumberMatch
          ? { shift_number: parseInt(shiftNumberMatch[1]), deleted_at: null }
          : { name: { [Op.iLike]: shift_raw }, deleted_at: null };

        const shift = await SShifts.findOne({
          where: shiftWhere,
          transaction: t,
        });
        if (!shift) {
          results.errors.push(`Row ${i}: Shift "${shift_raw}" not found`);
          results.skipped++;
          continue;
        }

        const line = await SLines.findOne({
          where: { name: line_name, deleted_at: null },
          transaction: t,
        });
        if (!line) {
          results.errors.push(`Row ${i}: Line "${line_name}" not found`);
          results.skipped++;
          continue;
        }

        const calendarType = await RefTypeCalendars.findOne({
          where: { name: cal_type_name, deleted_at: null },
          transaction: t,
        });
        if (!calendarType) {
          results.errors.push(
            `Row ${i}: Calendar type "${cal_type_name}" not found`
          );
          results.skipped++;
          continue;
        }

        const ghost = await SShiftCalendars.findOne({
          where: {
            shift_id: shift.id,
            line_id: line.id,
            start_date,
            end_date,
            deleted_at: { [Op.ne]: null },
          },
          paranoid: false,
          transaction: t,
        });

        if (ghost) {
          const oldData = ghost.toJSON();
          await ghost.restore({ transaction: t });
          ghost.ref_type_calendar_id = calendarType.id;
          ghost.date_event = date_event;
          ghost.active = active;
          await ghost.save({ transaction: t });

          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "RESTORE",
            resourceId: ghost.id,
            oldData,
            newData: ghost,
            description: `Restored shift calendar via upload (${date_event})`,
            transaction: t,
          });
          results.restored++;
        } else {
          // cek duplikat aktif
          const duplicate = await SShiftCalendars.findOne({
            where: {
              shift_id: shift.id,
              line_id: line.id,
              start_date,
              end_date,
            },
            transaction: t,
          });

          if (duplicate) {
            results.skipped++;
            continue;
          }

          const calendar = await SShiftCalendars.create(
            {
              shift_id: shift.id,
              line_id: line.id,
              ref_type_calendar_id: calendarType.id,
              start_date,
              end_date,
              date_event,
              active,
            },
            { transaction: t }
          );

          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "CREATE",
            resourceId: calendar.id,
            newData: calendar,
            description: `Created shift calendar via upload (${date_event})`,
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
      console.log(`[ShiftCalendarModule][upload]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }
}

export default new ShiftCalendarModule();
