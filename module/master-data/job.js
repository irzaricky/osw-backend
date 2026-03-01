import db from "../../models/index.js";
import { Op } from "sequelize";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import ExcelJS from "exceljs";
import Joi from "joi";

const { SJobs, RefJobTypes, sequelize } = db;

class JobModule extends BaseModule {
  async getJobTypes(req, res) {
    let tmp = {};
    try {
      // ref_job_types punya deleted_at
      const types = await RefJobTypes.findAll({
        where: { deleted_at: null },
        attributes: ["id", "name", "description"],
        order: [["name", "ASC"]],
      });
      tmp = { status: true, code: 200, data: types };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[JobModule][getJobTypes]:`, error);
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
      const jobs = await SJobs.findAll({
        where: { deleted_at: null, active: true },
        attributes: ["id", "job_code", "name"],
        order: [["name", "ASC"]],
      });
      tmp = { status: true, code: 200, data: jobs };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[JobModule][getDropdown]:`, error);
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
      const job_type_id = params.job_type_id;
      const active = params.active;

      const where = { deleted_at: null };
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { job_code: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (job_type_id) where.job_type_id = job_type_id;
      if (active !== undefined) where.active = active === "true";

      const { count, rows } = await SJobs.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ["deleted_at"] },
        include: [
          { model: RefJobTypes, as: "job_type", attributes: ["id", "name"] },
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
      console.log(`[JobModule][list]:`, error);
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
        job_code: Joi.string().max(50).required(),
        name: Joi.string().max(150).required(),
        job_type_id: Joi.number().integer().required(),
        standard_time: Joi.number().integer().default(0),
        active: Joi.boolean().default(true),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { job_code, name, job_type_id, standard_time, active } =
        validation.value;

      const existing = await SJobs.findOne({
        where: { job_code },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = { status: false, code: 400, error: "Job code already exists" };
        return helper.sendResponse(res, tmp);
      }

      const existingType = await RefJobTypes.findOne({
        where: { id: job_type_id, deleted_at: null },
        transaction: t,
      });
      if (!existingType) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Job type not found" };
        return helper.sendResponse(res, tmp);
      }

      let job;

      if (existing && existing.deleted_at) {
        const oldData = existing.toJSON();
        await existing.restore({ transaction: t });
        existing.name = name;
        existing.job_type_id = job_type_id;
        existing.standard_time = standard_time;
        existing.active = active;
        await existing.save({ transaction: t });
        job = existing;

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "RESTORE",
          resourceId: existing.id,
          oldData,
          newData: existing,
          description: `Restored job with code ${job_code}`,
          transaction: t,
        });
      } else {
        job = await SJobs.create(
          { job_code, name, job_type_id, standard_time, active },
          { transaction: t }
        );

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "CREATE",
          resourceId: job.id,
          newData: job,
          description: `Created job with code ${job_code}`,
          transaction: t,
        });
      }

      await t.commit();
      tmp = {
        status: true,
        code: 201,
        message: "Job created successfully",
        data: job,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[JobModule][add]:`, error);
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
        job_code: Joi.string().max(50).required(),
        name: Joi.string().max(150).required(),
        job_type_id: Joi.number().integer().required(),
        standard_time: Joi.number().integer().default(0),
        active: Joi.boolean().default(true),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { job_code, name, job_type_id, standard_time, active } =
        validation.value;

      const job = await SJobs.findByPk(id, { transaction: t });
      if (!job) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Job not found" };
        return helper.sendResponse(res, tmp);
      }

      const existing = await SJobs.findOne({
        where: { job_code, id: { [Op.ne]: id } },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = { status: false, code: 400, error: "Job code already exists" };
        return helper.sendResponse(res, tmp);
      }

      if (existing && existing.deleted_at) {
        await existing.destroy({ force: true, transaction: t });
      }

      const existingType = await RefJobTypes.findOne({
        where: { id: job_type_id, deleted_at: null },
        transaction: t,
      });
      if (!existingType) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Job type not found" };
        return helper.sendResponse(res, tmp);
      }

      const oldData = job.toJSON();
      await job.update(
        { job_code, name, job_type_id, standard_time, active },
        { transaction: t }
      );

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "UPDATE",
        resourceId: job.id,
        oldData,
        newData: job,
        description: `Updated job with code ${job_code}`,
        transaction: t,
      });

      await t.commit();
      tmp = {
        status: true,
        code: 200,
        message: "Job updated successfully",
        data: job,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[JobModule][update]:`, error);
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

      const job = await SJobs.findByPk(id, { transaction: t });
      if (!job) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Job not found" };
        return helper.sendResponse(res, tmp);
      }

      const oldData = job.toJSON();
      await job.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "DELETE",
        resourceId: job.id,
        oldData,
        description: `Deleted job ${job.name}`,
        transaction: t,
      });

      await t.commit();
      tmp = { status: true, code: 200, message: "Job deleted successfully" };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[JobModule][delete]:`, error);
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
          { job_code: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (params.job_type_id) where.job_type_id = params.job_type_id;

      const jobs = await SJobs.findAll({
        where,
        include: [{ model: RefJobTypes, as: "job_type", attributes: ["name"] }],
        order: [["created_at", "DESC"]],
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Jobs");

      worksheet.columns = [
        { header: "Job Code", key: "job_code", width: 20 },
        { header: "Job Name", key: "name", width: 30 },
        { header: "Job Type", key: "job_type", width: 25 },
        { header: "Standard Time (minutes)", key: "standard_time", width: 28 },
        { header: "Active", key: "active", width: 12 },
      ];
      worksheet.getRow(1).font = { bold: true };

      jobs.forEach((j) => {
        worksheet.addRow({
          job_code: j.job_code,
          name: j.name,
          job_type: j.job_type?.name || "",
          standard_time: j.standard_time,
          active: j.active ? "Active" : "Inactive",
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=jobs_${Date.now()}.xlsx`
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.log(`[JobModule][download]:`, error);
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
        "Job Code",
        "Job Name",
        "Job Type",
        "Standard Time (minutes)",
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
        const job_code = row.getCell(1).value?.toString().trim();
        const name = row.getCell(2).value?.toString().trim();
        const type_name = row.getCell(3).value?.toString().trim();
        const standard_time = parseInt(row.getCell(4).value) || 0;
        const active =
          row.getCell(5).value?.toString().trim().toLowerCase() !== "inactive";

        if (!job_code) {
          results.errors.push(`Row ${i}: Job code is required`);
          results.skipped++;
          continue;
        }
        if (!name) {
          results.errors.push(`Row ${i}: Job name is required`);
          results.skipped++;
          continue;
        }

        const jobType = await RefJobTypes.findOne({
          where: { name: type_name, deleted_at: null },
          transaction: t,
        });
        if (!jobType) {
          results.errors.push(`Row ${i}: Job type "${type_name}" not found`);
          results.skipped++;
          continue;
        }

        const existing = await SJobs.findOne({
          where: { job_code },
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
          existing.job_type_id = jobType.id;
          existing.standard_time = standard_time;
          existing.active = active;
          await existing.save({ transaction: t });
          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "RESTORE",
            resourceId: existing.id,
            oldData,
            newData: existing,
            description: `Restored job via upload (${job_code})`,
            transaction: t,
          });
          results.restored++;
        } else {
          const job = await SJobs.create(
            { job_code, name, job_type_id: jobType.id, standard_time, active },
            { transaction: t }
          );
          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "CREATE",
            resourceId: job.id,
            newData: job,
            description: `Created job via upload (${job_code})`,
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
      console.log(`[JobModule][upload]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }
}

export default new JobModule();
