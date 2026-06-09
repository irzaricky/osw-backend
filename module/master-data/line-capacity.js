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
  sequelize,
} = db;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getMonthRange(year, month) {
  const pad   = (n) => String(n).padStart(2, "0");
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0); // day-0 bulan berikutnya = hari terakhir bulan ini
  return {
    startDate: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    endDate:   `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

function formatPeriod(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function calcNetMinutes(shiftEntries) {
  let productive = 0;
  let breakTime  = 0;

  for (const s of shiftEntries) {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);

    let start = sh * 60 + sm;
    let end   = eh * 60 + em;
    if (end <= start) end += 24 * 60; // lintas tengah malam

    const duration = end - start;
    if (s.category === "PRODUCTIVE") productive += duration;
    else if (s.category === "BREAK")  breakTime  += duration;
  }

  return Math.max(0, productive - breakTime);
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveShiftCalendarParams
// Derive working_days, shifts_per_day, working_hours_per_shift, overtime_hours
// langsung dari s_shift_calendars untuk rentang tanggal yang diberikan.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveShiftCalendarParams(lineId, startDate, endDate, transaction = null) {
  const opts = transaction ? { transaction } : {};

  if (!startDate || !endDate) {
    throw new Error(
      `resolveShiftCalendarParams: startDate dan endDate wajib diisi (line_id: ${lineId})`
    );
  }

  const rangeStart = new Date(startDate);
  const rangeEnd   = new Date(endDate);

  if (rangeStart > rangeEnd) {
    throw new Error(
      `resolveShiftCalendarParams: startDate (${startDate}) tidak boleh lebih besar dari endDate (${endDate})`
    );
  }

  // Ambil shift calendars yang overlap dengan periode yang diminta.
  // Overlap: cal.start_date <= rangeEnd AND cal.end_date >= rangeStart
  const calendars = await SShiftCalendars.findAll({
    where: {
      line_id:    lineId,
      active:     true,
      deleted_at: null,
      start_date: { [Op.lte]: endDate   },
      end_date:   { [Op.gte]: startDate },
    },
    include: [
      {
        model:      SShifts,
        as:         "shift",
        where:      { active: true, deleted_at: null },
        attributes: ["id", "shift_number", "type", "start_time", "end_time", "category"],
      },
      {
        model:      RefTypeCalendars,
        as:         "type_calendar",
        attributes: ["id", "code", "name", "is_holiday"],
      },
    ],
    order: [["start_date", "ASC"]],
    ...opts,
  });

  if (!calendars.length) return null;

  // ── Expand ke per-hari, diklem dalam [startDate, endDate] ────────────────
  const dayMap = new Map(); // dateStr → { is_holiday, regularShifts[], overtimeShifts[] }

  for (const cal of calendars) {
    const isHoliday = cal.type_calendar?.is_holiday ?? false;
    const shift     = cal.shift;
    if (!shift) continue;

    const calStart  = new Date(cal.start_date);
    const calEnd    = new Date(cal.end_date);
    const loopStart = calStart < rangeStart ? rangeStart : calStart;
    const loopEnd   = calEnd   > rangeEnd   ? rangeEnd   : calEnd;

    for (let d = new Date(loopStart); d <= loopEnd; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split("T")[0];

      if (!dayMap.has(key)) {
        dayMap.set(key, { is_holiday: isHoliday, regularShifts: [], overtimeShifts: [] });
      }
      const day      = dayMap.get(key);
      day.is_holiday = isHoliday; // entry terbaru menang jika konflik

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
  const shiftsPerDayArr = workingDays.map((day) => {
    const uniqueNums = new Set(day.regularShifts.map((s) => s.shift_number));
    return uniqueNums.size;
  });
  const shifts_per_day = Math.round(
    shiftsPerDayArr.reduce((a, b) => a + b, 0) / shiftsPerDayArr.length
  );

  // ── Hitung working_hours_per_shift ────────────────────────────────────────
  const netMinutesPerWorkingDay = workingDays.map((day) => calcNetMinutes(day.regularShifts));
  const avgNetMinutesPerDay =
    netMinutesPerWorkingDay.reduce((a, b) => a + b, 0) / netMinutesPerWorkingDay.length;
  const working_hours_per_shift =
    shifts_per_day > 0
      ? parseFloat((avgNetMinutesPerDay / 60 / shifts_per_day).toFixed(2))
      : 0;

  // ── Hitung overtime_hours ─────────────────────────────────────────────────
  const netMinutesPerOvertimeDay = overtimeDays.map((day) => calcNetMinutes(day.overtimeShifts));
  const avgOvertimeMinutesPerDay =
    netMinutesPerOvertimeDay.length > 0
      ? netMinutesPerOvertimeDay.reduce((a, b) => a + b, 0) / netMinutesPerOvertimeDay.length
      : 0;
  const overtime_hours = parseFloat((avgOvertimeMinutesPerDay / 60).toFixed(2));

  const allDates = [...dayMap.keys()].sort();

  return {
    working_days,
    shifts_per_day,
    working_hours_per_shift,
    overtime_hours,
    total_overtime_days: overtimeDays.length,
    date_range:      { start: allDates[0], end: allDates[allDates.length - 1] },
    requested_range: { start: startDate, end: endDate },
    breakdown: {
      avg_net_minutes_per_working_day:  Math.round(avgNetMinutesPerDay),
      avg_net_minutes_per_overtime_day: Math.round(avgOvertimeMinutesPerDay),
      working_day_count:                workingDays.length,
      overtime_day_count:               overtimeDays.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// formatParamRow — shape response param yang konsisten
// ─────────────────────────────────────────────────────────────────────────────

function formatParamRow(p) {
  return {
    id:                              p.id,
    param_year:                      p.param_year,
    param_month:                     p.param_month,
    period:                          formatPeriod(p.param_year, p.param_month),
    default_working_days:            p.default_working_days,
    default_shifts_per_day:          p.default_shifts_per_day,
    default_working_hours_per_shift: parseFloat(p.default_working_hours_per_shift),
    default_efficiency_factor:       parseFloat(p.default_efficiency_factor),
    default_overtime_hours:          parseFloat(p.default_overtime_hours),
    default_manpower:                p.default_manpower,
    default_max_takt_time:           p.default_max_takt_time,
    calculated_at:                   p.updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// _doCalculate — inti kalkulasi, dipanggil oleh calculate() dan cronRecalculateAll()
//
// Perubahan dari versi lama:
//   - default_manpower tidak lagi diderivasi dari SEmployeeGroup/SEmployeeGroupMember
//     (kedua tabel telah dihapus dari schema).
//   - manpower sekarang diterima sebagai parameter eksplisit dari caller.
//   - Validasi manpower === 0 tetap dipertahankan agar tidak menyimpan data
//     yang tidak valid.
// ─────────────────────────────────────────────────────────────────────────────

async function _doCalculate({ line_id, year, month, efficiency_factor, manpower, transaction: t, req }) {
  const { startDate, endDate } = getMonthRange(year, month);
  const periodLabel            = formatPeriod(year, month);

  // 1. Validasi line
  const line = await SLines.findOne({
    where:       { id: line_id, deleted_at: null },
    attributes:  ["id", "line_code", "name"],
    transaction: t,
  });
  if (!line) throw Object.assign(new Error("Line not found"), { code: 404 });

  // 2. Validasi manpower
  if (!manpower || manpower < 1) {
    throw Object.assign(
      new Error(`Manpower harus diisi dan bernilai minimal 1.`),
      { code: 422 }
    );
  }

  // 3. Derive dari shift calendar untuk bulan yang dipilih
  const calendarParams = await resolveShiftCalendarParams(line_id, startDate, endDate, t);
  if (!calendarParams) {
    throw Object.assign(
      new Error(
        `Shift calendar tidak ditemukan untuk line ${line.line_code} periode ${periodLabel}. ` +
        `Pastikan shift calendar sudah dikonfigurasi untuk periode tersebut.`
      ),
      { code: 422 }
    );
  }

  const { working_days, shifts_per_day, working_hours_per_shift, overtime_hours } = calendarParams;

  // 4. Data aktual line (stations & takt time dari routing)
  const tmp           = new LineCapacityModule();
  const actualSummary = await tmp._getLineSummary(line_id, t);

  if (actualSummary.total_active_stations === 0)
    throw Object.assign(new Error(`Line ${line.line_code} belum memiliki station aktif.`), { code: 422 });
  if (actualSummary.total_active_jobs === 0)
    throw Object.assign(new Error(`Line ${line.line_code} belum ada job aktif di station manapun.`), { code: 422 });

  // 5. Upsert berdasarkan (line_id, param_year, param_month)
  const paramPayload = {
    default_working_days:            working_days,
    default_shifts_per_day:          shifts_per_day,
    default_working_hours_per_shift: working_hours_per_shift,
    default_overtime_hours:          overtime_hours,
    default_efficiency_factor:       efficiency_factor,
    default_manpower:                manpower,
    default_max_takt_time:           actualSummary.max_takt_time_seconds,
  };

  const [savedParams, created] = await SLineCapacityParam.findOrCreate({
    where:    { line_id, param_year: year, param_month: month },
    defaults: { line_id, param_year: year, param_month: month, ...paramPayload },
    transaction: t,
  });

  if (!created) {
    const oldData = savedParams.toJSON();
    await savedParams.update(paramPayload, { transaction: t });

    if (req) {
      const mod = new LineCapacityModule();
      await mod.logActivity(req, {
        moduleCode:   "master-data",
        activityCode: "UPDATE",
        resourceId:   savedParams.id,
        oldData,
        newData:      savedParams,
        description:  `Updated capacity params: line ${line.line_code} periode ${periodLabel}`,
        transaction:  t,
      });
    }
  } else {
    if (req) {
      const mod = new LineCapacityModule();
      await mod.logActivity(req, {
        moduleCode:   "master-data",
        activityCode: "CREATE",
        resourceId:   savedParams.id,
        newData:      savedParams,
        description:  `Created capacity params: line ${line.line_code} periode ${periodLabel}`,
        transaction:  t,
      });
    }
  }

  return {
    line:         { id: line.id, line_code: line.line_code, name: line.name },
    period:       { year, month, period: periodLabel, startDate, endDate },
    created,
    saved_params: formatParamRow(savedParams),
    derived_from: {
      calendar:    calendarParams,
      actual_line: {
        total_active_stations: actualSummary.total_active_stations,
        total_active_jobs:     actualSummary.total_active_jobs,
        max_takt_time_seconds: actualSummary.max_takt_time_seconds,
      },
    },
  };
}

class LineCapacityModule extends BaseModule {

  async getParams(req, res) {
    try {
      const { line_id } = req.params;

      const querySchema = Joi.object({
        year: Joi.number().integer().min(2000).max(2100).optional(),
      });
      const qVal = helper.validate(req.query, querySchema);
      if (!qVal.status) return helper.sendResponse(res, qVal);
      const { year } = qVal.value;

      const line = await SLines.findOne({
        where:      { id: line_id, deleted_at: null },
        attributes: ["id", "line_code", "name"],
      });
      if (!line) {
        return helper.sendResponse(res, { status: false, code: 404, message: "Line not found" });
      }

      const whereClause = { line_id };
      if (year) whereClause.param_year = year;

      const [allParams, actualSummary] = await Promise.all([
        SLineCapacityParam.findAll({
          where: whereClause,
          order: [
            ["param_year",  "DESC"],
            ["param_month", "DESC"],
          ],
        }),
        this._getLineSummary(line_id),
      ]);

      return helper.sendResponse(res, {
        status: true,
        code:   200,
        data: {
          line:         { id: line.id, line_code: line.line_code, name: line.name },
          actual:       actualSummary,
          total_params: allParams.length,
          params:       allParams.map(formatParamRow),
        },
      });
    } catch (error) {
      console.log("[LineCapacityModule][getParams]:", error);
      return helper.sendResponse(res, { status: false, code: 500, message: error.message });
    }
  }

  async previewParams(req, res) {
    try {
      const { line_id } = req.params;

      const now = new Date();
      const querySchema = Joi.object({
        year:  Joi.number().integer().min(2000).max(2100).default(now.getFullYear()),
        month: Joi.number().integer().min(1).max(12).default(now.getMonth() + 1),
      });
      const qVal = helper.validate(req.query, querySchema);
      if (!qVal.status) return helper.sendResponse(res, qVal);

      const { year, month }        = qVal.value;
      const { startDate, endDate } = getMonthRange(year, month);
      const periodLabel            = formatPeriod(year, month);

      const line = await SLines.findOne({
        where:      { id: line_id, deleted_at: null },
        attributes: ["id", "line_code", "name"],
      });
      if (!line) {
        return helper.sendResponse(res, { status: false, code: 404, message: "Line not found" });
      }

      const [calendarParams, actualSummary, existingParam, latestParam] = await Promise.all([
        resolveShiftCalendarParams(line_id, startDate, endDate),
        this._getLineSummary(line_id),
        SLineCapacityParam.findOne({
          where: { line_id, param_year: year, param_month: month },
        }),
        SLineCapacityParam.findOne({
          where: { line_id },
          order: [["param_year", "DESC"], ["param_month", "DESC"]],
        }),
      ]);

      const suggested_manpower =
        existingParam?.default_manpower ??
        latestParam?.default_manpower   ??
        null;

      return helper.sendResponse(res, {
        status: true,
        code:   200,
        data: {
          line:           { id: line.id, line_code: line.line_code, name: line.name },
          preview_period: { year, month, period: periodLabel, startDate, endDate },
          already_calculated: existingParam !== null,
          existing_param:     existingParam ? formatParamRow(existingParam) : null,
          // Nilai yang akan dihitung otomatis dari shift calendar & routing
          calendar_params:    calendarParams, // null = shift calendar belum dikonfigurasi
          actual:             actualSummary,
          // Hint untuk field manpower yang harus diisi user di request calculate()
          suggested_manpower,
        },
      });
    } catch (error) {
      console.log("[LineCapacityModule][previewParams]:", error);
      return helper.sendResponse(res, { status: false, code: 500, message: error.message });
    }
  }

  async calculate(req, res) {
    const t = await sequelize.transaction();
    try {
      const { line_id } = req.params;

      const now          = new Date();
      const currentYear  = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // Ambil param terbaru untuk default efficiency_factor & manpower
      const latestParam = await SLineCapacityParam.findOne({
        where: { line_id },
        order: [["param_year", "DESC"], ["param_month", "DESC"]],
        transaction: t,
      });

      const schema = Joi.object({
        year:  Joi.number().integer().min(2000).max(2100).default(currentYear),
        month: Joi.number().integer().min(1).max(12).default(currentMonth),
        efficiency_factor: Joi.number().min(0.1).max(1)
          .default(latestParam ? parseFloat(latestParam.default_efficiency_factor) : 0.85),
        // manpower wajib diisi. Jika ada param bulan sebelumnya, jadikan default
        // agar tidak memaksa user mengetik ulang nilai yang sama tiap bulan.
        manpower: latestParam
          ? Joi.number().integer().min(1).default(latestParam.default_manpower)
          : Joi.number().integer().min(1).required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        await t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { year, month, efficiency_factor, manpower } = validation.value;

      // Tidak boleh menghitung ulang bulan yang sudah lewat
      const selectedPeriod = year * 100 + month;
      const currentPeriod  = currentYear * 100 + currentMonth;
      if (selectedPeriod < currentPeriod) {
        await t.rollback();
        return helper.sendResponse(res, {
          status:  false,
          code:    400,
          message: `Tidak dapat menghitung parameter untuk bulan yang sudah lewat. ` +
                   `Dipilih: ${formatPeriod(year, month)}, ` +
                   `bulan berjalan: ${formatPeriod(currentYear, currentMonth)}.`,
        });
      }

      let result;
      try {
        result = await _doCalculate({
          line_id,
          year,
          month,
          efficiency_factor,
          manpower,
          transaction: t,
          req,
        });
      } catch (err) {
        await t.rollback();
        return helper.sendResponse(res, {
          status:  false,
          code:    err.code ?? 500,
          message: err.message,
        });
      }

      await t.commit();

      const periodLabel = formatPeriod(year, month);
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: result.created
          ? `Capacity params berhasil dibuat untuk periode ${periodLabel}.`
          : `Capacity params berhasil diperbarui untuk periode ${periodLabel}.`,
        data: result,
      });
    } catch (error) {
      await t.rollback();
      console.log("[LineCapacityModule][calculate]:", error);
      return helper.sendResponse(res, { status: false, code: 500, message: error.message });
    }
  }

  async deleteParam(req, res) {
    const t = await sequelize.transaction();
    try {
      const { line_id, year, month } = req.params;
      const y = parseInt(year,  10);
      const m = parseInt(month, 10);

      if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
        await t.rollback();
        return helper.sendResponse(res, { status: false, code: 400, message: "year atau month tidak valid." });
      }

      const now            = new Date();
      const currentPeriod  = now.getFullYear() * 100 + (now.getMonth() + 1);
      const selectedPeriod = y * 100 + m;

      if (selectedPeriod >= currentPeriod) {
        await t.rollback();
        return helper.sendResponse(res, {
          status:  false,
          code:    400,
          message: `Hanya baris bulan yang sudah lewat yang boleh dihapus. ` +
                   `Periode ${formatPeriod(y, m)} adalah bulan berjalan atau mendatang.`,
        });
      }

      const param = await SLineCapacityParam.findOne({
        where: { line_id, param_year: y, param_month: m },
        transaction: t,
      });
      if (!param) {
        await t.rollback();
        return helper.sendResponse(res, {
          status:  false,
          code:    404,
          message: `Tidak ada parameter untuk line ${line_id} periode ${formatPeriod(y, m)}.`,
        });
      }

      await param.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode:   "master-data",
        activityCode: "DELETE",
        resourceId:   param.id,
        oldData:      param,
        description:  `Deleted capacity params line ${line_id} periode ${formatPeriod(y, m)}`,
        transaction:  t,
      });

      await t.commit();
      return helper.sendResponse(res, {
        status:  true,
        code:    200,
        message: `Parameter periode ${formatPeriod(y, m)} berhasil dihapus.`,
      });
    } catch (error) {
      await t.rollback();
      console.log("[LineCapacityModule][deleteParam]:", error);
      return helper.sendResponse(res, { status: false, code: 500, message: error.message });
    }
  }

  async cronRecalculateAll(req = null, res = null) {
    const now        = new Date();
    const year       = now.getFullYear();
    const month      = now.getMonth() + 1;
    const isCronCall = res === null;

    const lines = await SLines.findAll({
      where:      { deleted_at: null },
      attributes: ["id", "line_code", "name"],
    });

    if (!lines.length) {
      const payload = { success: false, message: "No active lines found." };
      return isCronCall
        ? payload
        : helper.sendResponse(res, { status: false, code: 404, message: payload.message });
    }

    const results    = [];
    let successCount = 0;
    let failCount    = 0;

    for (const line of lines) {
      const t = await sequelize.transaction();
      try {
        // Ambil efficiency_factor & manpower dari param bulan terakhir yang tersimpan.
        // Jika belum pernah ada param untuk line ini, lewati — tidak ada data
        // manpower yang bisa dijadikan acuan.
        const latestParam = await SLineCapacityParam.findOne({
          where: { line_id: line.id },
          order: [["param_year", "DESC"], ["param_month", "DESC"]],
          transaction: t,
        });

        if (!latestParam) {
          await t.rollback();
          failCount++;
          results.push({
            line_id:   line.id,
            line_code: line.line_code,
            status:    "skipped",
            period:    formatPeriod(year, month),
            reason:    "Belum ada parameter tersimpan untuk line ini. Lakukan kalkulasi manual pertama kali melalui endpoint calculate.",
          });
          continue;
        }

        const efficiency_factor = parseFloat(latestParam.default_efficiency_factor);
        const manpower          = latestParam.default_manpower;

        await _doCalculate({
          line_id:     line.id,
          year,
          month,
          efficiency_factor,
          manpower,
          transaction: t,
          req:         null, // tidak ada req saat cron → skip logActivity
        });

        await t.commit();
        successCount++;
        results.push({
          line_id:   line.id,
          line_code: line.line_code,
          status:    "ok",
          period:    formatPeriod(year, month),
        });
      } catch (err) {
        await t.rollback();
        failCount++;
        results.push({
          line_id:   line.id,
          line_code: line.line_code,
          status:    "error",
          period:    formatPeriod(year, month),
          reason:    err.message,
        });
        console.warn(`[LineCapacity][cron] Line ${line.line_code} gagal: ${err.message}`);
      }
    }

    const summary = {
      period:        { year, month, period: formatPeriod(year, month) },
      total_lines:   lines.length,
      success_count: successCount,
      fail_count:    failCount,
      results,
    };

    if (isCronCall) return summary;

    return helper.sendResponse(res, {
      status:  true,
      code:    200,
      message: `Recalculation selesai. ${successCount} berhasil, ${failCount} gagal.`,
      data:    summary,
    });
  }

  async _getLineSummary(line_id, transaction = null) {
    const queryOpts = transaction ? { transaction } : {};

    const stations = await SStations.findAll({
      where:      { line_id, status: true, deleted_at: null },
      attributes: ["id", "station_code", "name", "sequence"],
      include: [
        {
          model:    SStationJobs,
          as:       "station_jobs",
          where:    { active: true, deleted_at: null },
          required: false,
          attributes: ["id", "sequence", "mandatory"],
          include: [
            {
              model:    SJobs,
              as:       "job",
              where:    { active: true, deleted_at: null },
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

    let maxTaktTime     = 0;
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

    return {
      total_active_stations: stations.length,
      total_active_jobs:     totalActiveJobs,
      max_takt_time_seconds: maxTaktTime,
      bottleneck_station:    stationSummaries.find((s) => s.takt_time_seconds === maxTaktTime) ?? null,
      stations:              stationSummaries,
    };
  }
}

export default new LineCapacityModule();