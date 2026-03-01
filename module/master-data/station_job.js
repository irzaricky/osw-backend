import db from "../../models/index.js";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import Joi from "joi";

const { SStations, SJobs, SStationJobs, sequelize } = db;

class StationJobModule extends BaseModule {
  async list(req, res) {
    let tmp = {};
    try {
      const { station_id } = req.params;

      const station = await SStations.findByPk(station_id);
      if (!station) {
        tmp = { status: false, code: 404, error: "Station not found" };
        return helper.sendResponse(res, tmp);
      }

      const jobs = await SStationJobs.findAll({
        where: { station_id, deleted_at: null },
        include: [
          {
            model: SJobs,
            as: "job",
            attributes: ["id", "job_code", "name", "standard_time"],
          },
        ],
        order: [["sequence", "ASC"]],
      });

      tmp = { status: true, code: 200, data: jobs };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[StationJobModule][list]:`, error);
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
      const { station_id } = req.params;

      const schema = Joi.object({
        job_id: Joi.number().integer().required(),
        sequence: Joi.number().integer().default(0),
        mandatory: Joi.boolean().default(true),
        active: Joi.boolean().default(true),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { job_id, sequence, mandatory, active } = validation.value;

      const station = await SStations.findByPk(station_id, { transaction: t });
      if (!station) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Station not found" };
        return helper.sendResponse(res, tmp);
      }

      const job = await SJobs.findByPk(job_id, { transaction: t });
      if (!job) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Job not found" };
        return helper.sendResponse(res, tmp);
      }

      const existing = await SStationJobs.findOne({
        where: { station_id, job_id },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          error: "Job already assigned to this station",
        };
        return helper.sendResponse(res, tmp);
      }

      let stationJob;

      if (existing && existing.deleted_at) {
        await existing.restore({ transaction: t });
        existing.sequence = sequence;
        existing.mandatory = mandatory;
        existing.active = active;
        await existing.save({ transaction: t });
        stationJob = existing;
      } else {
        stationJob = await SStationJobs.create(
          { station_id, job_id, sequence, mandatory, active },
          { transaction: t }
        );
      }

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "CREATE",
        resourceId: stationJob.id,
        newData: stationJob,
        description: `Assigned job "${job.name}" to station "${station.name}"`,
        transaction: t,
      });

      await t.commit();
      tmp = {
        status: true,
        code: 201,
        message: "Job assigned successfully",
        data: stationJob,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[StationJobModule][add]:`, error);
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
      const { station_id, id } = req.params;

      const schema = Joi.object({
        job_id: Joi.number().integer().required(),
        sequence: Joi.number().integer().default(0),
        mandatory: Joi.boolean().default(true),
        active: Joi.boolean().default(true),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const stationJob = await SStationJobs.findOne({
        where: { id, station_id },
        transaction: t,
      });
      if (!stationJob) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Station job not found" };
        return helper.sendResponse(res, tmp);
      }

      const job = await SJobs.findByPk(validation.value.job_id, {
        transaction: t,
      });
      if (!job) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Job not found" };
        return helper.sendResponse(res, tmp);
      }

      const oldData = stationJob.toJSON();
      await stationJob.update(validation.value, { transaction: t });

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "UPDATE",
        resourceId: stationJob.id,
        oldData,
        newData: stationJob,
        description: `Updated station job id ${id} in station id ${station_id}`,
        transaction: t,
      });

      await t.commit();
      tmp = {
        status: true,
        code: 200,
        message: "Job assignment updated",
        data: stationJob,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[StationJobModule][update]:`, error);
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
      const { station_id, id } = req.params;

      const stationJob = await SStationJobs.findOne({
        where: { id, station_id },
        transaction: t,
      });
      if (!stationJob) {
        await t.rollback();
        tmp = { status: false, code: 404, error: "Station job not found" };
        return helper.sendResponse(res, tmp);
      }

      const oldData = stationJob.toJSON();
      await stationJob.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: "master-data",
        activityCode: "DELETE",
        resourceId: stationJob.id,
        oldData,
        description: `Removed job assignment id ${id} from station id ${station_id}`,
        transaction: t,
      });

      await t.commit();
      tmp = { status: true, code: 200, message: "Job assignment removed" };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[StationJobModule][delete]:`, error);
      tmp = {
        status: false,
        code: 500,
        error: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }
}

export default new StationJobModule();
