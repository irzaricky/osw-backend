import db from "../../models/index.js";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import Joi from "joi";

const {
  SLines,
  SLineCapacityParam,
  SStations,
  SStationJobs,
  SJobs,
  SEmployeeGroup,
  SEmployeeGroupMember,
  SEmployeePosition,
  sequelize,
} = db;

const NON_OPERATOR_POSITIONS = ["Group Leader", "Foreman"];


class LineCapacityModule extends BaseModule {

  // GET /line-capacity/:line_id/params
  async getParams(req, res) {
    let tmp = {};
    try {
      const { line_id } = req.params;

      const line = await SLines.findOne({
        where: { id: line_id, deleted_at: null },
        attributes: ["id", "line_code", "name"],
      });

      if (!line) {
        tmp = { status: false, code: 404, message: "Line not found" };
        return helper.sendResponse(res, tmp);
      }

      const [savedParams, actualSummary] = await Promise.all([
        SLineCapacityParam.findOne({ where: { line_id } }),
        this._getLineSummary(line_id),
      ]);

      tmp = {
        status: true,
        code: 200,
        data: {
          line: { id: line.id, line_code: line.line_code, name: line.name },
          saved_params: savedParams
            ? {
                id:                              savedParams.id,
                default_working_days:            savedParams.default_working_days,
                default_shifts_per_day:          savedParams.default_shifts_per_day,
                default_working_hours_per_shift: parseFloat(savedParams.default_working_hours_per_shift),
                default_efficiency_factor:       parseFloat(savedParams.default_efficiency_factor),
                default_overtime_hours:          parseFloat(savedParams.default_overtime_hours),
                default_manpower:                savedParams.default_manpower,
                default_max_takt_time:           savedParams.default_max_takt_time,
                last_updated_at:                 savedParams.updated_at,
              }
            : null,

          actual: actualSummary,
        },
      };

      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[LineCapacityModule][getParams]:`, error);
      tmp = { status: false, code: error.code || 500, message: error.message || "Internal Server Error" };
      return helper.sendResponse(res, tmp);
    }
  }


  // POST /line-capacity/:line_id/calculate
  async calculate(req, res) {
    let tmp = {};
    const t = await sequelize.transaction();
    try {
      const { line_id } = req.params;

      const line = await SLines.findOne({
        where: { id: line_id, deleted_at: null },
        attributes: ["id", "line_code", "name"],
        transaction: t,
      });

      if (!line) {
        await t.rollback();
        tmp = { status: false, code: 404, message: "Line not found" };
        return helper.sendResponse(res, tmp);
      }

      // Ambil nilai tersimpan sebagai fallback default untuk input user
      const existing = await SLineCapacityParam.findOne({
        where: { line_id },
        transaction: t,
      });

      const schema = Joi.object({
        working_days: Joi.number().integer().min(1).max(366)
          .default(existing?.default_working_days ?? 22),
        shifts_per_day: Joi.number().integer().min(1).max(3)
          .default(existing?.default_shifts_per_day ?? 1),
        working_hours_per_shift: Joi.number().min(0.5).max(12)
          .default(existing ? parseFloat(existing.default_working_hours_per_shift) : 7),
        efficiency_factor: Joi.number().min(0.1).max(1)
          .default(existing ? parseFloat(existing.default_efficiency_factor) : 0.85),
        overtime_hours: Joi.number().min(0).max(8)
          .default(existing ? parseFloat(existing.default_overtime_hours) : 0),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const {
        working_days,
        shifts_per_day,
        working_hours_per_shift,
        efficiency_factor,
        overtime_hours,
      } = validation.value;

      // Hitung dari kondisi aktual
      const actualSummary = await this._getLineSummary(line_id, t);

      if (actualSummary.total_active_stations === 0) {
        await t.rollback();
        tmp = {
          status: false,
          code: 422,
          message: "Line belum memiliki station aktif. Tambahkan station terlebih dahulu.",
        };
        return helper.sendResponse(res, tmp);
      }

      if (actualSummary.total_active_jobs === 0) {
        await t.rollback();
        tmp = {
          status: false,
          code: 422,
          message: "Belum ada job aktif di line ini. Tambahkan job ke station terlebih dahulu.",
        };
        return helper.sendResponse(res, tmp);
      }

      if (actualSummary.default_manpower === 0) {
        await t.rollback();
        tmp = {
          status: false,
          code: 422,
          message: "Belum ada operator aktif di line ini. Assign employee group terlebih dahulu.",
        };
        return helper.sendResponse(res, tmp);
      }

      // ── Upsert ke s_line_capacity_params ───────────────────────────────────
      const paramPayload = {
        default_working_days:            working_days,
        default_shifts_per_day:          shifts_per_day,
        default_working_hours_per_shift: working_hours_per_shift,
        default_efficiency_factor:       efficiency_factor,
        default_overtime_hours:          overtime_hours,
        // Dihitung otomatis dari data aktual:
        default_manpower:                actualSummary.default_manpower,
        default_max_takt_time:           actualSummary.max_takt_time_seconds,
      };

      let savedParams;

      if (existing) {
        const oldData = existing.toJSON();
        await existing.update(paramPayload, { transaction: t });
        savedParams = existing;

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "UPDATE",
          resourceId: existing.id,
          oldData,
          newData: existing,
          description: `Recalculated capacity params for line ${line.line_code}`,
          transaction: t,
        });
      } else {
        savedParams = await SLineCapacityParam.create(
          { line_id, ...paramPayload },
          { transaction: t }
        );

        await this.logActivity(req, {
          moduleCode: "master-data",
          activityCode: "CREATE",
          resourceId: savedParams.id,
          newData: savedParams,
          description: `Created capacity params for line ${line.line_code}`,
          transaction: t,
        });
      }

      await t.commit();

      tmp = {
        status: true,
        code: 200,
        message: existing
          ? "Capacity params updated successfully"
          : "Capacity params created successfully",
        data: {
          line: { id: line.id, line_code: line.line_code, name: line.name },
          saved_params: {
            id:                              savedParams.id,
            default_working_days:            savedParams.default_working_days,
            default_shifts_per_day:          savedParams.default_shifts_per_day,
            default_working_hours_per_shift: parseFloat(savedParams.default_working_hours_per_shift),
            default_efficiency_factor:       parseFloat(savedParams.default_efficiency_factor),
            default_overtime_hours:          parseFloat(savedParams.default_overtime_hours),
            default_manpower:                savedParams.default_manpower,
            default_max_takt_time:           savedParams.default_max_takt_time,
          },
          // Kondisi aktual yang menjadi dasar kalkulasi manpower & takt time
          calculated_from: actualSummary,
        },
      };

      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[LineCapacityModule][calculate]:`, error);
      tmp = { status: false, code: error.code || 500, message: error.message || "Internal Server Error" };
      return helper.sendResponse(res, tmp);
    }
  }

  // Private: _getLineSummary
  async _getLineSummary(line_id, transaction = null) {
    const queryOpts = transaction ? { transaction } : {};

    const stations = await SStations.findAll({
      where: { line_id, status: true, deleted_at: null },
      attributes: ["id", "station_code", "name", "sequence"],
      include: [
        {
          model: SStationJobs,
          as: "station_jobs",
          where: { active: true, deleted_at: null },
          required: false,
          attributes: ["id", "sequence", "mandatory"],
          include: [
            {
              model: SJobs,
              as: "job",
              where: { active: true, deleted_at: null },
              required: false,
              attributes: ["id", "job_code", "name", "standard_time"],
            },
          ],
        },
      ],
      order: [
        ["sequence", "ASC"],
        [{ model: SStationJobs, as: "station_jobs" }, "sequence", "ASC"],
      ],
      ...queryOpts,
    });

    // Takt time per station = SUM(standard_time) semua job di station itu
    // (job dalam satu station dikerjakan oleh 1 operator secara sekuensial)
    // Bottleneck = station dengan takt time terbesar → ini yang membatasi output lini
    let maxTaktTime = 0;
    let totalActiveJobs = 0;

    const stationSummaries = stations.map((station) => {
      const jobs = (station.station_jobs ?? [])
        .filter((sj) => sj.job != null)
        .map((sj) => sj.job);

      const stationTaktTime = jobs.reduce((sum, job) => sum + (job.standard_time ?? 0), 0);
      if (stationTaktTime > maxTaktTime) maxTaktTime = stationTaktTime;
      totalActiveJobs += jobs.length;

      return {
        station_id:        station.id,
        station_code:      station.station_code,
        name:              station.name,
        sequence:          station.sequence,
        total_jobs:        jobs.length,
        takt_time_seconds: stationTaktTime,
        jobs: jobs.map((j) => ({
          id:            j.id,
          job_code:      j.job_code,
          name:          j.name,
          standard_time: j.standard_time,
        })),
      };
    });

    // Employee group & manpower
    const groups = await SEmployeeGroup.findAll({
      where: { line_id, active: true },
      attributes: ["id", "name"],
      include: [
        {
          model: SEmployeeGroupMember,
          as: "members",
          where: { active: true },
          required: false,
          attributes: ["id", "name", "position_id"],
          include: [
            {
              model: SEmployeePosition,
              as: "position",
              attributes: ["id", "name"],
              required: false,
            },
          ],
        },
      ],
      ...queryOpts,
    });

    let totalOperators  = 0;
    let totalAllMembers = 0;

    const groupSummaries = groups.map((group) => {
      const allMembers = group.members ?? [];
      const operators  = allMembers.filter((m) => {
        const pos = m.position?.name ?? "";
        return !NON_OPERATOR_POSITIONS.some((nonOp) =>
          pos.toLowerCase().includes(nonOp.toLowerCase())
        );
      });

      totalAllMembers += allMembers.length;
      totalOperators  += operators.length;

      return {
        group_id:        group.id,
        group_name:      group.name,
        total_members:   allMembers.length,
        total_operators: operators.length,
      };
    });

    return {
      total_active_stations: stations.length,
      total_active_jobs:     totalActiveJobs,
      max_takt_time_seconds: maxTaktTime,
      bottleneck_station:    stationSummaries.find((s) => s.takt_time_seconds === maxTaktTime) ?? null,
      default_manpower:      totalOperators,
      total_all_members:     totalAllMembers,
      groups:                groupSummaries,
      stations:              stationSummaries,
    };
  }
}

export default new LineCapacityModule();