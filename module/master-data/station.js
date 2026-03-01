import db from "../../models/index.js";
import { Op } from "sequelize";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import ExcelJS from "exceljs";
import Joi from "joi";

const { SStations, SLines, RefStationTypes, sequelize } = db;

class StationModule extends BaseModule {
  async getStationTypes(req, res) {
    let tmp = {};
    try {
      const types = await RefStationTypes.findAll({
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
      });
      tmp = { status: true, code: 200, data: types };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[StationModule][getStationTypes]:`, error);
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
      const stations = await SStations.findAll({
        where: { deleted_at: null, status: true },
        attributes: ["id", "name", "station_code"],
        order: [["name", "ASC"]],
      });
      tmp = { status: true, code: 200, data: stations };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[StationModule][getDropdown]:`, error);
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
      const line_id = params.line_id;
      const station_type_id = params.station_type_id;
      const status = params.status;

      const where = { deleted_at: null };
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { station_code: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (line_id) where.line_id = line_id;
      if (station_type_id) where.station_type_id = station_type_id;
      if (status !== undefined) where.status = status === "true";

      const { count, rows } = await SStations.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ["deleted_at"] },
        include: [
          { model: SLines, as: "line", attributes: ["id", "name"] },
          {
            model: RefStationTypes,
            as: "station_type",
            attributes: ["id", "name"],
          },
        ],
        order: [["created_at", "DESC"]],
      });

      tmp = {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[StationModule][list]:`, error);
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
        station_code: Joi.string().max(50).required(),
        name: Joi.string().max(100).required(),
        line_id: Joi.number().integer().required(),
        station_type_id: Joi.number().integer().required(),
        sequence: Joi.number().integer().default(0),
        status: Joi.boolean().default(true),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { station_code, name, line_id, station_type_id, sequence, status } =
        validation.value;

      const existing = await SStations.findOne({
        where: { station_code },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          error: "Station code already exists",
        };
        return helper.sendResponse(res, tmp);
      }

      const existingLine = await SLines.findByPk(line_id, { transaction: t });
      if (!existingLine) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Line not found" };
        return helper.sendResponse(res, tmp);
      }

      const existingType = await RefStationTypes.findByPk(station_type_id, {
        transaction: t,
      });
      if (!existingType) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Station type not found" };
        return helper.sendResponse(res, tmp);
      }

      let station;

      if (existing && existing.deleted_at) {
        const oldData = existing.toJSON();
        await existing.restore({ transaction: t });
        existing.name = name;
        existing.line_id = line_id;
        existing.station_type_id = station_type_id;
        existing.sequence = sequence;
        existing.status = status;
        await existing.save({ transaction: t });
        station = existing;

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "RESTORE",
          resourceId: existing.id,
          oldData,
          newData: existing,
          description: `Restored station with code ${station_code}`,
          transaction: t,
        });
      } else {
        station = await SStations.create(
          { station_code, name, line_id, station_type_id, sequence, status },
          { transaction: t }
        );

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "CREATE",
          resourceId: station.id,
          newData: station,
          description: `Created station with code ${station_code}`,
          transaction: t,
        });
      }

      await t.commit();
      tmp = {
        status: true,
        code: 201,
        message: "Station created successfully",
        data: station,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[StationModule][add]:`, error);
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
        station_code: Joi.string().max(50).required(),
        name: Joi.string().max(100).required(),
        line_id: Joi.number().integer().required(),
        station_type_id: Joi.number().integer().required(),
        sequence: Joi.number().integer().default(0),
        status: Joi.boolean().default(true),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { station_code, name, line_id, station_type_id, sequence, status } =
        validation.value;

      const station = await SStations.findByPk(id, { transaction: t });
      if (!station) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Station not found" };
        return helper.sendResponse(res, tmp);
      }

      const existing = await SStations.findOne({
        where: { station_code, id: { [Op.ne]: id } },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          error: "Station code already exists",
        };
        return helper.sendResponse(res, tmp);
      }

      if (existing && existing.deleted_at) {
        await existing.destroy({ force: true, transaction: t });
      }

      const existingLine = await SLines.findByPk(line_id, { transaction: t });
      if (!existingLine) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Line not found" };
        return helper.sendResponse(res, tmp);
      }

      const existingType = await RefStationTypes.findByPk(station_type_id, {
        transaction: t,
      });
      if (!existingType) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Station type not found" };
        return helper.sendResponse(res, tmp);
      }

      const oldData = station.toJSON();
      await station.update(
        { station_code, name, line_id, station_type_id, sequence, status },
        { transaction: t }
      );

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "UPDATE",
        resourceId: station.id,
        oldData,
        newData: station,
        description: `Updated station with code ${station_code}`,
        transaction: t,
      });

      await t.commit();
      tmp = {
        status: true,
        code: 200,
        message: "Station updated successfully",
        data: station,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[StationModule][update]:`, error);
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

      const station = await SStations.findByPk(id, { transaction: t });
      if (!station) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Station not found" };
        return helper.sendResponse(res, tmp);
      }

      const oldData = station.toJSON();
      await station.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "DELETE",
        resourceId: station.id,
        oldData,
        description: `Deleted station ${station.name}`,
        transaction: t,
      });

      await t.commit();
      tmp = {
        status: true,
        code: 200,
        message: "Station deleted successfully",
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[StationModule][delete]:`, error);
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
          { station_code: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (params.line_id) where.line_id = params.line_id;
      if (params.station_type_id)
        where.station_type_id = params.station_type_id;

      const stations = await SStations.findAll({
        where,
        include: [
          { model: SLines, as: "line", attributes: ["name"] },
          { model: RefStationTypes, as: "station_type", attributes: ["name"] },
        ],
        order: [["created_at", "DESC"]],
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Stations");

      worksheet.columns = [
        { header: "Station Code", key: "station_code", width: 20 },
        { header: "Station Name", key: "name", width: 30 },
        { header: "Line", key: "line", width: 25 },
        { header: "Station Type", key: "station_type", width: 25 },
        { header: "Sequence", key: "sequence", width: 12 },
        { header: "Status", key: "status", width: 12 },
      ];
      worksheet.getRow(1).font = { bold: true };

      stations.forEach((s) => {
        worksheet.addRow({
          station_code: s.station_code,
          name: s.name,
          line: s.line?.name || "",
          station_type: s.station_type?.name || "",
          sequence: s.sequence,
          status: s.status ? "Active" : "Inactive",
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=stations_${Date.now()}.xlsx`
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.log(`[StationModule][download]:`, error);
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
        "Station Code",
        "Station Name",
        "Line",
        "Station Type",
        "Sequence",
        "Status",
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
        const station_code = row.getCell(1).value?.toString().trim();
        const name = row.getCell(2).value?.toString().trim();
        const line_name = row.getCell(3).value?.toString().trim();
        const type_name = row.getCell(4).value?.toString().trim();
        const sequence = parseInt(row.getCell(5).value) || 0;
        const status =
          row.getCell(6).value?.toString().trim().toLowerCase() !== "inactive";

        if (!station_code) {
          results.errors.push(`Row ${i}: Station code is required`);
          results.skipped++;
          continue;
        }
        if (!name) {
          results.errors.push(`Row ${i}: Station name is required`);
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

        const stationType = await RefStationTypes.findOne({
          where: { name: type_name },
          transaction: t,
        });
        if (!stationType) {
          results.errors.push(
            `Row ${i}: Station type "${type_name}" not found`
          );
          results.skipped++;
          continue;
        }

        const existing = await SStations.findOne({
          where: { station_code },
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
          existing.line_id = line.id;
          existing.station_type_id = stationType.id;
          existing.sequence = sequence;
          existing.status = status;
          await existing.save({ transaction: t });
          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "RESTORE",
            resourceId: existing.id,
            oldData,
            newData: existing,
            description: `Restored station via upload (${station_code})`,
            transaction: t,
          });
          results.restored++;
        } else {
          const station = await SStations.create(
            {
              station_code,
              name,
              line_id: line.id,
              station_type_id: stationType.id,
              sequence,
              status,
            },
            { transaction: t }
          );
          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "CREATE",
            resourceId: station.id,
            newData: station,
            description: `Created station via upload (${station_code})`,
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
      console.log(`[StationModule][upload]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }
}

export default new StationModule();
