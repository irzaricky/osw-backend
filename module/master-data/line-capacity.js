import { Op } from "sequelize";
import db from "../../models/index.js";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import Joi from "joi";

const {
  SLines,
  SLineCapacityParam,
  SShiftCalendars,
  SShifts,
  RefTypeCalendars,
  SStations,
  SStationJobs,
  SJobs,
  SEmployeeGroup,
  SEmployeeGroupMember,
  SEmployeePosition,
  sequelize,
} = db;

const NON_OPERATOR_POSITIONS = ["Group Leader", "Foreman"];

/**
 * Hitung durasi netto dalam menit dari array shift entries.
 * Net = SUM(PRODUCTIVE) - SUM(BREAK)
 * Mendukung shift lintas tengah malam.
 */
function calcNetMinutes(shiftEntries) {
  let productive = 0;
  let breakTime = 0;

  for (const s of shiftEntries) {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);

    let start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end <= start) end += 24 * 60; // lintas tengah malam

    const duration = end - start;
    if (s.category === "PRODUCTIVE") productive += duration;
    else if (s.category === "BREAK") breakTime += duration;
  }

  return Math.max(0, productive - breakTime);
}

/**
 * Derive parameter kapasitas dari shift calendar line.
 *
 * Logika:
 * - Working day  → s_shift_calendars JOIN ref_type_calendars WHERE is_holiday = false
 *                  Shift yang dipakai: type = 'REGULAR'
 * - Overtime day → s_shift_calendars JOIN ref_type_calendars WHERE is_holiday = true
 *                  Shift yang dipakai: type = 'NON REGULAR'
 *
 * Output:
 * - working_days            : jumlah hari unik bertipe WORKING_DAY
 * - shifts_per_day          : rata-rata jumlah shift_number unik REGULAR per hari kerja
 * - working_hours_per_shift : rata-rata jam netto REGULAR per shift per hari kerja
 * - overtime_hours          : rata-rata jam netto NON REGULAR per hari overtime
 *                             (bukan per hari kerja — karena overtime hari libur
 *                              tidak proporsional dengan jumlah hari kerja)
 */
async function resolveShiftCalendarParams(lineId, transaction = null) {
  const opts = transaction ? { transaction } : {};

  const calendars = await SShiftCalendars.findAll({
    where: { line_id: lineId, active: true, deleted_at: null },
    include: [
      {
        model: SShifts,
        as: "shift",
        where: { active: true, deleted_at: null },
        attributes: ["id", "shift_number", "type", "start_time", "end_time", "category"],
      },
      {
        model: RefTypeCalendars,
        as: "type_calendar",
        attributes: ["id", "code", "name", "is_holiday"],
      },
    ],
    order: [["start_date", "ASC"]],
    ...opts,
  });

  if (!calendars.length) return null;

  // ── Expand ke per-hari ────────────────────────────────────────────────────
  // Map: dateStr -> { is_holiday, regularShifts: [], overtimeShifts: [] }
  const dayMap = new Map();

  for (const cal of calendars) {
    const isHoliday = cal.type_calendar?.is_holiday ?? false;
    const shift = cal.shift;
    if (!shift) continue;

    const start = new Date(cal.start_date);
    const end = new Date(cal.end_date);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split("T")[0];

      if (!dayMap.has(key)) {
        dayMap.set(key, { is_holiday: isHoliday, regularShifts: [], overtimeShifts: [] });
      }

      const day = dayMap.get(key);
      // Update is_holiday dari entry terbaru (jika ada konflik)
      day.is_holiday = isHoliday;

      if (shift.type === "REGULAR") {
        day.regularShifts.push(shift);
      } else if (shift.type === "NON REGULAR") {
        day.overtimeShifts.push(shift);
      }
    }
  }

  // ── Pisahkan hari kerja vs hari overtime ──────────────────────────────────
  const workingDays  = [];
  const overtimeDays = [];

  for (const [, day] of dayMap) {
    if (!day.is_holiday) workingDays.push(day);
    else overtimeDays.push(day);
  }

  if (workingDays.length === 0) return null;

  // ── Hitung working_days ───────────────────────────────────────────────────
  const working_days = workingDays.length;

  // ── Hitung shifts_per_day ─────────────────────────────────────────────────
  // Jumlah shift = jumlah shift_number unik REGULAR per hari
  // (shift_number = identitas shift, misal 1=pagi, 2=sore, 3=malam)
  const shiftsPerDayArr = workingDays.map((day) => {
    const uniqueShiftNumbers = new Set(
      day.regularShifts.map((s) => s.shift_number)
    );
    return uniqueShiftNumbers.size;
  });

  const shifts_per_day = Math.round(
    shiftsPerDayArr.reduce((a, b) => a + b, 0) / shiftsPerDayArr.length
  );

  // ── Hitung working_hours_per_shift ────────────────────────────────────────
  // Net menit per hari = PRODUCTIVE - BREAK dari shift REGULAR
  // Lalu bagi dengan shifts_per_day untuk dapat per-shift
  const netMinutesPerWorkingDay = workingDays.map((day) =>
    calcNetMinutes(day.regularShifts)
  );

  const avgNetMinutesPerDay =
    netMinutesPerWorkingDay.reduce((a, b) => a + b, 0) /
    netMinutesPerWorkingDay.length;

  const working_hours_per_shift =
    shifts_per_day > 0
      ? parseFloat((avgNetMinutesPerDay / 60 / shifts_per_day).toFixed(2))
      : 0;

  // ── Hitung overtime_hours ─────────────────────────────────────────────────
  // Jam netto dari shift NON REGULAR di hari is_holiday = true
  // Rata-rata per hari overtime (bukan per hari kerja)
  const netMinutesPerOvertimeDay = overtimeDays.map((day) =>
    calcNetMinutes(day.overtimeShifts)
  );

  const avgOvertimeMinutesPerDay =
    netMinutesPerOvertimeDay.length > 0
      ? netMinutesPerOvertimeDay.reduce((a, b) => a + b, 0) /
        netMinutesPerOvertimeDay.length
      : 0;

  const overtime_hours = parseFloat(
    (avgOvertimeMinutesPerDay / 60).toFixed(2)
  );

  // ── Susun breakdown untuk transparency ───────────────────────────────────
  const allDates = [...dayMap.keys()].sort();

  return {
    working_days,
    shifts_per_day,
    working_hours_per_shift,
    overtime_hours,
    // Info tambahan
    total_overtime_days: overtimeDays.length,
    date_range: {
      start: allDates[0],
      end:   allDates[allDates.length - 1],
    },
    breakdown: {
      avg_net_minutes_per_working_day:  Math.round(avgNetMinutesPerDay),
      avg_net_minutes_per_overtime_day: Math.round(avgOvertimeMinutesPerDay),
      working_day_count:                workingDays.length,
      overtime_day_count:               overtimeDays.length,
    },
  };
}

class LineCapacityModule extends BaseModule {

  // GET /line-capacity/:line_id/params
  async getParams(req, res) {
    try {
      const { line_id } = req.params;

      const line = await SLines.findOne({
        where: { id: line_id, deleted_at: null },
        attributes: ["id", "line_code", "name"],
      });

      if (!line) {
        return helper.sendResponse(res, {
          status: false,
          code: 404,
          message: "Line not found",
        });
      }

      const [savedParams, actualSummary, calendarParams] = await Promise.all([
        SLineCapacityParam.findOne({ where: { line_id } }),
        this._getLineSummary(line_id),
        resolveShiftCalendarParams(line_id),
      ]);

      return helper.sendResponse(res, {
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
          // Parameter dari shift calendar (auto-derived)
          calendar_params: calendarParams,
          actual: actualSummary,
        },
      });
    } catch (error) {
      console.log("[LineCapacityModule][getParams]:", error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message,
      });
    }
  }

  // POST /line-capacity/:line_id/calculate
  async calculate(req, res) {
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
        return helper.sendResponse(res, {
          status: false,
          code: 404,
          message: "Line not found",
        });
      }

      // ── 1. Ambil parameter dari shift calendar ──────────────────────────────
      const calendarParams = await resolveShiftCalendarParams(line_id, t);

      if (!calendarParams) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 422,
          message:
            "Shift calendar belum dikonfigurasi untuk line ini. " +
            "Tambahkan shift calendar di Master Data terlebih dahulu.",
        });
      }

      const {
        working_days,
        shifts_per_day,
        working_hours_per_shift,
        overtime_hours,
      } = calendarParams;

      // ── 2. Validasi input tambahan (efficiency saja, sisanya dari calendar) ─
      const existing = await SLineCapacityParam.findOne({
        where: { line_id },
        transaction: t,
      });

      const schema = Joi.object({
        efficiency_factor: Joi.number()
          .min(0.1)
          .max(1)
          .default(
            existing
              ? parseFloat(existing.default_efficiency_factor)
              : 0.85
          ),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { efficiency_factor } = validation.value;

      // ── 3. Ambil data aktual line (manpower & takt time) ───────────────────
      const actualSummary = await this._getLineSummary(line_id, t);

      if (actualSummary.total_active_stations === 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 422,
          message:
            "Line belum memiliki station aktif. Tambahkan station terlebih dahulu.",
        });
      }

      if (actualSummary.total_active_jobs === 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 422,
          message:
            "Belum ada job aktif di line ini. Tambahkan job ke station terlebih dahulu.",
        });
      }

      if (actualSummary.default_manpower === 0) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 422,
          message:
            "Belum ada operator aktif di line ini. Assign employee group terlebih dahulu.",
        });
      }

      // ── 4. Upsert ke s_line_capacity_params ────────────────────────────────
      const paramPayload = {
        // Dari shift calendar (auto)
        default_working_days:            working_days,
        default_shifts_per_day:          shifts_per_day,
        default_working_hours_per_shift: working_hours_per_shift,
        default_overtime_hours:          overtime_hours,
        // Dari input user
        default_efficiency_factor:       efficiency_factor,
        // Dari data aktual line
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

      return helper.sendResponse(res, {
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
          // Sumber nilai yang digunakan
          derived_from: {
            calendar: calendarParams,
            actual_line: {
              total_active_stations: actualSummary.total_active_stations,
              total_active_jobs:     actualSummary.total_active_jobs,
              default_manpower:      actualSummary.default_manpower,
              max_takt_time_seconds: actualSummary.max_takt_time_seconds,
            },
          },
        },
      });
    } catch (error) {
      await t.rollback();
      console.log("[LineCapacityModule][calculate]:", error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message,
      });
    }
  }

  // ── Private: _getLineSummary (tidak berubah) ────────────────────────────────
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

    let maxTaktTime = 0;
    let totalActiveJobs = 0;

    const stationSummaries = stations.map((station) => {
      const jobs = (station.station_jobs ?? [])
        .filter((sj) => sj.job != null)
        .map((sj) => sj.job);

      const stationTaktTime = jobs.reduce(
        (sum, job) => sum + (job.standard_time ?? 0),
        0
      );
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
      bottleneck_station:    stationSummaries.find(
        (s) => s.takt_time_seconds === maxTaktTime
      ) ?? null,
      default_manpower:      totalOperators,
      total_all_members:     totalAllMembers,
      groups:                groupSummaries,
      stations:              stationSummaries,
    };
  }
}

export default new LineCapacityModule();