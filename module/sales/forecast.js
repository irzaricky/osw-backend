import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import ExcelJS from 'exceljs';
import Joi from 'joi';
import dayjs from 'dayjs';

const {
  SSalesForecasts, SSalesForecastDetails, SSalesForecastLogs,
  SCustomers, SParts, SUsers, SUserDetail,
  SSalesPurchaseRequests, SSalesPurchaseRequestDetails, SSalesPurchaseRequestLogs
} = db;

class ForecastModule extends BaseModule {
  async list(req) {
    try {
      const params = req.query;
      const { start_date, end_date, customer_id, status, search, forecast_type, is_archive } = params;

      let limit, page, offset;
      if (is_archive === 'false') {
        limit = undefined;
        page = 1;
        offset = undefined;
      } else {
        const pagination = helper.getPagination(params);
        limit = pagination.limit;
        page = pagination.page;
        offset = pagination.offset;
      }

      const where = {};

      if (start_date && end_date) {
        where.start_period = { [Op.gte]: start_date };
        where.end_period = { [Op.lte]: end_date };
      }

      const currentYearStart = `${dayjs().year()}-01-01`;
      if (is_archive === 'true') {
        where.start_period = { ...(where.start_period || {}), [Op.lt]: currentYearStart };
      } else if (is_archive === 'false') {
        where.start_period = { ...(where.start_period || {}), [Op.gte]: currentYearStart };
      }

      if (customer_id) {
        where.customer_id = customer_id;
      }

      if (status) {
        where.status = status;
      }

      // Supervisor filtering
      if (req.user.role === 'Supervisor Sales') {
        const allowedStatuses = ['Submitted', 'Rejected', 'Approved'];
        if (status) {
          if (!allowedStatuses.includes(status)) {
            where.status = { [Op.in]: [] };
          }
        } else {
          where.status = { [Op.in]: allowedStatuses };
        }
      }

      if (forecast_type) {
        where.forecast_type = forecast_type;
      }

      if (search) {
        where[Op.or] = [
          { forecast_number: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ];
      }

      const include = [
        {
          model: SCustomers,
          as: 'customer',
          attributes: ['id', 'customer_code', 'name']
        },
        {
          model: SUsers,
          as: 'staff',
          attributes: ['id', 'email'],
          include: [
            {
              model: SUserDetail,
              as: 'user_detail',
              attributes: ['full_name']
            }
          ]
        }
      ];

      const { count, rows } = await SSalesForecasts.findAndCountAll({
        where,
        attributes: {
          include: [
            [
              db.sequelize.literal(`(
          SELECT COALESCE(
            ROUND(
              COUNT(CASE WHEN forecast_qty > 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)
            ),
            100
          )
          FROM s_sales_forecast_details
          WHERE s_sales_forecast_details.forecast_id = "SSalesForecasts".id
        )`),
              'fill_completeness'
            ]
          ]
        },
        include,
        limit,
        offset,
        order: is_archive === 'true'
          ? [['start_period', 'DESC'], ['forecast_number', 'DESC']]
          : [['customer_id', 'ASC'], ['status', 'ASC']]
      });

      if (is_archive === 'false') {
        return {
          status: true,
          data: {
            rows,
            count,
            page: 1,
            limit: count,
            totalPages: 1
          }
        };
      }

      return {
        status: true,
        data: helper.getPaginationData(rows, count, page, limit)
      };
    } catch (error) {
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async getDropdownCustomers(req) {
    try {
      const customers = await SCustomers.findAll({
        attributes: ['id', 'customer_code', 'name'],
        order: [['name', 'ASC']]
      });
      return { status: true, data: customers };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async getDropdownForecastTypes(req) {
    return {
      status: true,
      data: ['Yearly', 'Half-Year', '4-Month']
    };
  }

  async getDropdownStatuses(req) {
    return {
      status: true,
      data: ['Draft', 'Submitted', 'Approved', 'Rejected']
    };
  }

  async getDropdownParts(req) {
    try {
      const parts = await SParts.findAll({
        where: { part_type_code: 'PRODUCT' },
        attributes: ['id', 'part_number', 'part_name'],
        order: [['part_name', 'ASC']]
      });
      return { status: true, data: parts };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async downloadTemplate(req, res) {
    try {
      const { forecast_type } = req.query;
      const is4Month = forecast_type === '4-Month';
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Forecast Template');

      // Columns differ by forecast type
      if (is4Month) {
        worksheet.columns = [
          { header: 'Part Number', key: 'part_number', width: 25 },
          { header: 'Period Date (YYYY-MM-DD)', key: 'period_date', width: 25 },
          { header: 'Forecast Qty', key: 'forecast_qty', width: 20 }
        ];
      } else {
        worksheet.columns = [
          { header: 'Part Number', key: 'part_number', width: 25 },
          { header: 'Forecast Qty', key: 'forecast_qty', width: 20 }
        ];
      }

      // Styling headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      const filename = is4Month ? 'forecast_4month_template.xlsx' : 'forecast_template.xlsx';
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      return helper.sendResponse(res, { status: false, message: 'Failed to generate template', code: 500 });
    }
  }

  async exportExcel(req, res) {
    try {
      const { id } = req.params;
      const { log_id } = req.query;

      const forecast = await SSalesForecasts.findByPk(id, {
        include: [
          {
            model: SCustomers,
            as: 'customer',
            attributes: ['customer_code', 'name']
          },
          {
            model: SSalesForecastDetails,
            as: 'details',
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['part_number', 'part_name']
              }
            ]
          }
        ]
      });

      if (!forecast) {
        return helper.sendResponse(res, { status: false, message: 'Forecast not found', code: 404 });
      }

      let details = [];
      let displayVersion = forecast.version;

      if (log_id) {
        const log = await SSalesForecastLogs.findByPk(log_id);
        if (log && log.details_snapshot) {
          try {
            details = JSON.parse(log.details_snapshot);
            displayVersion = log.version;
          } catch (e) {
            return helper.sendResponse(res, { status: false, message: 'Invalid historical data format.', code: 500 });
          }
        } else {
          return helper.sendResponse(res, { status: false, message: 'Historical snapshot not found for this log.', code: 404 });
        }
      } else {
        details = forecast.details.map(d => ({
          part_number: d.part?.part_number,
          part_name: d.part?.part_name,
          period_date: d.period_date,
          qty_status: d.qty_status,
          forecast_qty: d.forecast_qty
        }));
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Forecast Details');

      // 1. Header Info
      worksheet.mergeCells('A1:B1');
      worksheet.getCell('A1').value = log_id ? `SALES FORECAST (HISTORICAL ${displayVersion})` : 'SALES FORECAST (CURRENT)';
      worksheet.getCell('A1').font = { size: 14, bold: true };

      worksheet.addRow(['Forecast Number', forecast.forecast_number]);
      worksheet.addRow(['Type', forecast.forecast_type]);
      worksheet.addRow(['Customer', `[${forecast.customer.customer_code}] ${forecast.customer.name}`]);
      worksheet.addRow(['Period', `${dayjs(forecast.start_period).format('MMM YYYY')} - ${dayjs(forecast.end_period).format('MMM YYYY')}`]);
      worksheet.addRow(['Status', log_id ? 'Historical' : forecast.status]);
      worksheet.addRow(['Version', displayVersion]);
      worksheet.addRow([]); // Spacer

      // 2. Table Headers
      const tableHeaderRow = ['No', 'Part Number', 'Part Name', 'Period Date', 'Status', 'Qty'];
      const headerRow = worksheet.addRow(tableHeaderRow);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // 3. Data Rows
      details.forEach((detail, index) => {
        const rowData = [
          index + 1,
          detail.part_number,
          detail.part_name,
          dayjs(detail.period_date).format('YYYY-MM-DD'),
          detail.qty_status,
          detail.forecast_qty
        ];
        const row = worksheet.addRow(rowData);
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // Adjust column widths
      worksheet.getColumn(1).width = 5;
      worksheet.getColumn(2).width = 25;
      worksheet.getColumn(3).width = 35;
      worksheet.getColumn(4).width = 20;
      worksheet.getColumn(5).width = 15;
      worksheet.getColumn(6).width = 15;

      const filename = `Forecast_${forecast.forecast_number}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      if (config.debug) {
        return helper.sendResponse(res, { status: false, error: error.message, code: 500 });
      }
      return helper.sendResponse(res, { status: false, message: 'Failed to export excel', code: 500 });
    }
  }

  async uploadTemplate(req) {
    try {
      if (!req.files || !req.files.file) {
        return { status: false, message: 'No file uploaded. Please upload a file with the key "file"', code: 400 };
      }

      const { forecast_type } = req.body; // 'Yearly', 'Half-Year', or '4-Month'
      const is4Month = forecast_type === '4-Month';

      const file = req.files.file;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.data);

      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        return { status: false, message: 'Invalid Excel file format', code: 400 };
      }

      const details = [];
      const errors = [];

      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);

        let partNumber = row.getCell(1).text?.trim();
        let periodDateStr = is4Month ? row.getCell(2).text?.trim() : null;
        let forecastQty = parseInt(is4Month ? row.getCell(3).value : row.getCell(2).value) || 0;

        if (!partNumber && !forecastQty) continue;

        if (!partNumber) {
          errors.push(`Row ${i}: Part Number is required.`);
          continue;
        }

        const part = await SParts.findOne({ where: { part_number: partNumber } });
        if (!part) {
          errors.push(`Row ${i}: Part Number '${partNumber}' not found.`);
          continue;
        }

        if (forecastQty < part.min_qty_sell) {
          errors.push(`Row ${i}: Forecast quantity for part ${part.part_number} (${forecastQty}) is less than the minimum sales quantity of ${part.min_qty_sell}.`);
          continue;
        }

        // For 4-Month: validate period_date
        if (is4Month) {
          if (!periodDateStr) {
            errors.push(`Row ${i}: Period Date is required for 4-Month forecast.`);
            continue;
          }
          const periodDate = dayjs(periodDateStr);
          if (!periodDate.isValid()) {
            errors.push(`Row ${i}: Invalid date format '${periodDateStr}'. Use YYYY-MM-DD.`);
            continue;
          }
          details.push({
            part_id: part.id,
            part_number: part.part_number,
            part_name: part.part_name,
            period_date: periodDate.format('YYYY-MM-DD'),
            forecast_qty: forecastQty
          });
        } else {
          // Yearly / Half-Year: no period_date from user
          details.push({
            part_id: part.id,
            part_number: part.part_number,
            part_name: part.part_name,
            forecast_qty: forecastQty
          });
        }
      }

      if (errors.length > 0) {
        return { status: false, message: 'Validation failed', data: errors, code: 400 };
      }

      return { status: true, message: 'File parsed successfully', data: details };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async detail(req) {
    try {
      const { id } = req.params;

      const forecast = await SSalesForecasts.findByPk(id, {
        include: [
          {
            model: SCustomers,
            as: 'customer',
            attributes: ['id', 'customer_code', 'name']
          },
          {
            model: SSalesForecastDetails,
            as: 'details',
            include: [
              {
                model: SParts,
                as: 'part',
                attributes: ['id', 'part_number', 'part_name', 'min_qty_sell']
              }
            ]
          },
          {
            model: SSalesForecastLogs,
            as: 'logs',
            include: [
              {
                model: SUsers,
                as: 'user',
                attributes: ['id', 'email'],
                include: [
                  {
                    model: SUserDetail,
                    as: 'user_detail',
                    attributes: ['full_name']
                  }
                ]
              }
            ]
          },
          {
            model: SUsers,
            as: 'staff',
            attributes: ['id', 'email'],
            include: [
              {
                model: SUserDetail,
                as: 'user_detail',
                attributes: ['full_name']
              }
            ]
          },
          {
            model: SUsers,
            as: 'approver',
            attributes: ['id', 'email'],
            include: [
              {
                model: SUserDetail,
                as: 'user_detail',
                attributes: ['full_name']
              }
            ]
          }
        ],
        order: [
          [{ model: SSalesForecastLogs, as: 'logs' }, 'created_at', 'DESC']
        ]
      });

      if (!forecast) {
        return { status: false, message: 'Forecast not found', code: 404 };
      }

      return { status: true, data: forecast };
    } catch (error) {
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async getLogs(req) {
    try {
      const { forecast_id } = req.params;

      const logs = await SSalesForecastLogs.findAll({
        where: { forecast_id },
        include: [
          {
            model: SUsers,
            as: 'user',
            attributes: ['id', 'email'],
            include: [
              {
                model: SUserDetail,
                as: 'user_detail',
                attributes: ['full_name']
              }
            ]
          }
        ],
        order: [['created_at', 'DESC']]
      });

      return { status: true, data: logs };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async getHistoricalQty(req) {
    try {
      const { forecast_id } = req.params;
      let { part_ids } = req.query;

      // Handle part_ids[] format often sent by frontend libraries/URLSearchParams
      if (!part_ids && req.query['part_ids[]']) {
        part_ids = req.query['part_ids[]'];
      }

      if (!part_ids) return { status: true, data: {} };
      if (!Array.isArray(part_ids)) part_ids = [part_ids];

      // 1. Get current forecast
      const currentForecast = await SSalesForecasts.findByPk(forecast_id, {
        attributes: ['id', 'customer_id', 'forecast_type', 'start_period', 'end_period']
      });
      if (!currentForecast) return { status: false, message: 'Forecast not found', code: 404 };

      // 2. Seasonality: Always look back at the same month in previous years (12-month interval)
      const stepMonths = 12;

      // 3. Generate period arrays for current forecast
      const generatePeriods = (start, end) => {
        const periods = [];
        let current = dayjs(start).startOf('month');
        const endMonth = dayjs(end).startOf('month');
        while (current.isBefore(endMonth) || current.isSame(endMonth)) {
          periods.push(current.format('YYYY-MM-01'));
          current = current.add(1, 'month');
        }
        return periods;
      };

      const currPeriods = generatePeriods(currentForecast.start_period, currentForecast.end_period);
      const is4Month = currentForecast.forecast_type === '4-Month';

      // 4. Calculate past 4 historical dates for each target period
      const allHistoricalDates = [];
      const periodToHistDatesMap = {}; // targetPeriod -> [histDate_1, histDate_2, histDate_3, histDate_4]
      for (const targetPeriod of currPeriods) {
        const dates = [];
        for (let i = 1; i <= 4; i++) {
          const histDate = dayjs(targetPeriod).subtract(i * stepMonths, 'month').format('YYYY-MM-01');
          dates.push(histDate);
          if (!allHistoricalDates.includes(histDate)) {
            allHistoricalDates.push(histDate);
          }
        }
        periodToHistDatesMap[targetPeriod] = dates;
      }

      // 5. Query approved forecast details that match the historical dates with qty_status = 'Fix'
      const historicalDetails = await SSalesForecastDetails.findAll({
        where: {
          part_id: { [Op.in]: part_ids.map(Number) },
          qty_status: 'Fix',
          period_date: { [Op.in]: allHistoricalDates }
        },
        include: [
          {
            model: SSalesForecasts,
            as: 'forecast',
            where: {
              customer_id: currentForecast.customer_id,
              // Removed forecast_type filter: search for 'Fix' qty across any forecast type
              status: 'Approved'
            },
            attributes: ['id', 'updated_at', 'forecast_number']
          }
        ],
        attributes: ['part_id', 'period_date', 'forecast_qty']
      });

      // Deduplicate: if multiple approved forecasts cover the same date, take the one with the highest ID (latest revision)
      const detailMap = {}; // "part_id:period_date" -> { qty, forecastId, forecastNumber }
      historicalDetails.forEach(detail => {
        const pDate = dayjs(detail.period_date).format('YYYY-MM-01');
        const key = `${detail.part_id}:${pDate}`;
        const forecastId = detail.forecast.id;
        const forecastNumber = detail.forecast.forecast_number;
        if (!detailMap[key] || forecastId > detailMap[key].forecastId) {
          detailMap[key] = {
            qty: detail.forecast_qty,
            forecastId: forecastId,
            forecastNumber: forecastNumber
          };
        }
      });

      // 6. Perform Single Exponential Smoothing over chronological matched history
      const ALPHA = 0.3;
      const result = {};

      for (const partId of part_ids.map(Number)) {
        result[partId] = {};
        let tempPeriodCount = 0;

        for (let idx = 0; idx < currPeriods.length; idx++) {
          const targetPeriod = currPeriods[idx];

          // 4-Month first period is Fix and 0
          if (is4Month && idx === 0) {
            result[partId][targetPeriod] = {
              qty: 0,
              status: 'Fix',
              isRecommended: false,
              calculation_breakdown: {
                type: 'none',
                message: 'First period of 4-Month forecast is always 0 Fix'
              }
            };
            continue;
          }

          // Otherwise, it is Temporary
          tempPeriodCount++;
          // Graduation multiplier: 1st temp = 1.0, 2nd temp = 1.05, 3rd temp = 1.10, etc.
          const multiplier = 1 + (tempPeriodCount - 1) * 0.05;

          // Retrieve historical details in chronological order: index 3 (oldest) down to 0 (newest)
          const values = [];
          const historical_data = []; // array of { date, qty, forecast_number }

          for (let i = 3; i >= 0; i--) {
            const histDate = periodToHistDatesMap[targetPeriod][i];
            const key = `${partId}:${histDate}`;
            if (detailMap[key]) {
              values.push(detailMap[key].qty);
              historical_data.push({
                date: histDate,
                qty: detailMap[key].qty,
                forecast_number: detailMap[key].forecastNumber
              });
            } else {
              historical_data.push({
                date: histDate,
                qty: null,
                forecast_number: null
              });
            }
          }

          let calculatedValue = 0;
          let fallback_used = false;
          let fallback_details = null;
          const ses_steps = []; // array of step objects for explanation

          if (values.length > 0) {
            let smoothed = values[0];
            ses_steps.push({
              step: 0,
              input_value: values[0],
              smoothed_value: smoothed,
              formula: `S0 = ${values[0]}`
            });

            for (let vIdx = 1; vIdx < values.length; vIdx++) {
              const prevSmoothed = smoothed;
              smoothed = ALPHA * values[vIdx] + (1 - ALPHA) * smoothed;
              ses_steps.push({
                step: vIdx,
                input_value: values[vIdx],
                smoothed_value: Math.round(smoothed * 100) / 100, // keep decimal precision
                formula: `S${vIdx} = 0.3 * ${values[vIdx]} + 0.7 * ${Math.round(prevSmoothed * 100) / 100}`
              });
            }
            calculatedValue = Math.round(smoothed);
          } else {
            fallback_used = true;
            // Fallback baseline: query any chronological approved Fix forecast details for the customer and part,
            // and use the nearest available historical Fix quantity.
            const fallbackDetail = await SSalesForecastDetails.findOne({
              where: {
                part_id: partId,
                qty_status: 'Fix'
              },
              include: [
                {
                  model: SSalesForecasts,
                  as: 'forecast',
                  where: {
                    customer_id: currentForecast.customer_id,
                    status: 'Approved'
                  },
                  attributes: ['id', 'forecast_number']
                }
              ],
              order: [
                ['period_date', 'DESC'],
                ['id', 'DESC']
              ],
              attributes: ['forecast_qty', 'period_date']
            });

            if (fallbackDetail) {
              calculatedValue = fallbackDetail.forecast_qty;
              fallback_details = {
                period_date: dayjs(fallbackDetail.period_date).format('YYYY-MM-01'),
                forecast_qty: fallbackDetail.forecast_qty,
                forecast_number: fallbackDetail.forecast.forecast_number
              };
            } else {
              calculatedValue = 0;
            }
          }

          // Apply graduation multiplier
          const finalQty = Math.round(calculatedValue * multiplier);

          result[partId][targetPeriod] = {
            qty: finalQty,
            status: 'Temporary',
            isRecommended: finalQty > 0,
            calculation_breakdown: {
              type: fallback_used ? 'fallback' : 'exponential_smoothing',
              historical_data,
              smoothed_value: calculatedValue,
              multiplier,
              temp_period_count: tempPeriodCount,
              final_qty: finalQty,
              fallback_used,
              fallback_details,
              ses_steps
            }
          };
        }
      }

      return { status: true, data: result };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async _checkDuplication(customer_id, forecast_type, start_period, end_period, excludeId = null, transaction) {
    const where = {
      customer_id,
      forecast_type,
      [Op.or]: [
        {
          start_period: { [Op.between]: [start_period, end_period] }
        },
        {
          end_period: { [Op.between]: [start_period, end_period] }
        },
        {
          [Op.and]: [
            { start_period: { [Op.lte]: start_period } },
            { end_period: { [Op.gte]: end_period } }
          ]
        }
      ]
    };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const existing = await SSalesForecasts.findOne({ where, transaction });
    return existing;
  }

  async _generateForecastNumber(dateStr, transaction) {
    const date = dayjs(dateStr);
    const yearMonth = date.format('YYYY-MM'); // e.g., 2025-11
    const prefix = `FC-${yearMonth}`;

    const lastForecast = await SSalesForecasts.findOne({
      where: {
        forecast_number: {
          [Op.like]: `${prefix}-%`
        }
      },
      order: [['forecast_number', 'DESC']],
      transaction,
      paranoid: false
    });

    let seq = 1;
    if (lastForecast) {
      const lastSeq = parseInt(lastForecast.forecast_number.split('-').pop(), 10);
      if (!isNaN(lastSeq)) {
        seq = lastSeq + 1;
      }
    }

    return `${prefix}-${seq.toString().padStart(4, '0')}`;
  }

  _incrementVersion(currentVersion) {
    if (!currentVersion) return 'V1';
    const match = currentVersion.match(/^V(\d+)$/);
    if (match) {
      const nextNum = parseInt(match[1], 10) + 1;
      return `V${nextNum}`;
    }
    return 'V1';
  }

  async createDraft(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;
      const currentUser = req.user;

      const detailSchema = Joi.object({
        part_id: Joi.number().integer().required(),
        period_date: Joi.date().iso().optional().allow(null, ''),
        forecast_qty: Joi.number().integer().min(0).required()
      });

      const schema = Joi.object({
        customer_id: Joi.number().integer().required(),
        forecast_type: Joi.string().valid('Yearly', 'Half-Year', '4-Month').required(),
        description: Joi.string().allow(null, '').optional(),
        details: Joi.array().items(detailSchema).optional().default([])
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { customer_id, forecast_type, description, details } = validation.value;

      if (details && details.length > 0) {
        const partIds = details.map(d => d.part_id);
        const parts = await SParts.findAll({
          where: { id: { [Op.in]: partIds } },
          attributes: ['id', 'part_number', 'min_qty_sell'],
          transaction: t
        });
        const partMap = new Map(parts.map(p => [p.id, p]));

        for (const d of details) {
          const part = partMap.get(d.part_id);
          if (!part) {
            await t.rollback();
            return { status: false, message: `Part with ID ${d.part_id} not found.`, code: 400 };
          }
          if (d.forecast_qty < part.min_qty_sell) {
            await t.rollback();
            return {
              status: false,
              message: `Forecast quantity for part ${part.part_number} (${d.forecast_qty}) is less than the minimum sales quantity of ${part.min_qty_sell}.`,
              code: 400
            };
          }
        }
      }

      // Auto-calculate start_period and end_period from forecast_type
      const today = dayjs();
      let start_period, end_period;

      if (forecast_type === 'Yearly') {
        const currentYear = today.year();
        start_period = `${currentYear}-01-01`;
        end_period = `${currentYear}-12-31`;
      } else if (forecast_type === 'Half-Year') {
        const currentMonth = today.month() + 1; // 1-12
        if (currentMonth <= 6) {
          start_period = `${today.year()}-01-01`;
          end_period = `${today.year()}-06-30`;
        } else {
          start_period = `${today.year()}-07-01`;
          end_period = `${today.year()}-12-31`;
        }
      } else if (forecast_type === '4-Month') {
        start_period = today.startOf('month').format('YYYY-MM-DD');
        end_period = today.add(3, 'month').endOf('month').format('YYYY-MM-DD');
      }

      // Duplicate validation
      const isDuplicate = await this._checkDuplication(customer_id, forecast_type, start_period, end_period, null, t);
      if (isDuplicate) {
        await t.rollback();
        return {
          status: false,
          message: 'A forecast already exists for this customer in the specified period.',
          code: 400
        };
      }

      // Generate Number
      const forecast_number = await this._generateForecastNumber(start_period, t);

      // Create Forecast
      const forecast = await SSalesForecasts.create({
        forecast_number,
        forecast_type,
        customer_id,
        start_period,
        end_period,
        description,
        version: 'V1',
        status: 'Draft',
        created_by: currentUser.id
      }, { transaction: t });

      let totalQty = 0;

      // Create Details
      if (details && details.length > 0) {
        const currentMonthStr = dayjs().format('YYYY-MM');
        const is4Month = forecast_type === '4-Month';

        const detailRecords = details.map((d, index) => {
          totalQty += d.forecast_qty;

          // Auto-set period_date for Yearly/Half-Year
          const effectivePeriodDate = is4Month
            ? d.period_date
            : start_period; // single record covers the full period

          let calculatedQtyStatus;
          if (forecast_type === 'Yearly' || forecast_type === 'Half-Year') {
            calculatedQtyStatus = 'Temporary';
          } else {
            const periodMonthStr = dayjs(effectivePeriodDate).format('YYYY-MM');
            if (periodMonthStr <= currentMonthStr) {
              calculatedQtyStatus = 'Fix';
            } else {
              calculatedQtyStatus = 'Temporary';
            }
          }

          return {
            forecast_id: forecast.id,
            forecast_detail_number: `${forecast_number}-D${(index + 1).toString().padStart(3, '0')}`,
            part_id: d.part_id,
            period_date: effectivePeriodDate,
            qty_status: calculatedQtyStatus,
            forecast_qty: d.forecast_qty
          };
        });

        await SSalesForecastDetails.bulkCreate(detailRecords, { transaction: t });
      }

      // Log creation
      await SSalesForecastLogs.create({
        forecast_id: forecast.id,
        version: 'V1',
        total_qty: totalQty,
        action: 'Created Draft',
        remarks: 'Initial creation of draft forecast',
        changed_by: currentUser.id
      }, { transaction: t });

      // Audit Log
      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'CREATE_FORECAST_DRAFT',
        resourceId: forecast.id,
        newData: forecast,
        description: `Created forecast draft ${forecast_number}`,
        transaction: t
      });

      await t.commit();
      return {
        status: true,
        message: 'Forecast draft created successfully',
        data: forecast
      };
    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async update(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const data = req.body;
      const currentUser = req.user;

      const forecast = await SSalesForecasts.findByPk(id, { transaction: t });
      if (!forecast) {
        await t.rollback();
        return { status: false, message: 'Forecast not found', code: 404 };
      }

      if (!['Draft', 'Rejected'].includes(forecast.status)) {
        await t.rollback();
        return { status: false, message: 'Only Draft or Rejected forecasts can be updated directly', code: 400 };
      }

      const schema = Joi.object({
        customer_id: Joi.number().integer().optional(),
        description: Joi.string().allow(null, '').optional()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const updates = validation.value;
      const oldData = JSON.parse(JSON.stringify(forecast));

      // Check for duplicate if customer changes
      if (updates.customer_id && updates.customer_id !== forecast.customer_id) {
        const isDuplicate = await this._checkDuplication(
          updates.customer_id,
          forecast.forecast_type,
          forecast.start_period,
          forecast.end_period,
          forecast.id,
          t
        );
        if (isDuplicate) {
          await t.rollback();
          return {
            status: false,
            message: 'A forecast of this type already exists for this customer in the specified period.',
            code: 400
          };
        }
      }

      await forecast.update(updates, { transaction: t });

      const totalQty = await SSalesForecastDetails.sum('forecast_qty', {
        where: { forecast_id: forecast.id },
        transaction: t
      }) || 0;

      // Log update
      await SSalesForecastLogs.create({
        forecast_id: forecast.id,
        version: forecast.version,
        total_qty: totalQty,
        action: 'Updated Draft',
        remarks: 'Updated forecast header (customer/description)',
        changed_by: currentUser.id
      }, { transaction: t });

      // Audit Log
      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'UPDATE_FORECAST_DRAFT',
        resourceId: forecast.id,
        oldData,
        newData: forecast,
        description: `Updated forecast draft ${forecast.forecast_number}`,
        transaction: t
      });

      await t.commit();
      return {
        status: true,
        message: 'Forecast draft updated successfully',
        data: forecast
      };
    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async updateDetails(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const data = req.body;
      const currentUser = req.user;

      const forecast = await SSalesForecasts.findByPk(id, { transaction: t });
      if (!forecast) {
        await t.rollback();
        return { status: false, message: 'Forecast not found', code: 404 };
      }

      if (!['Draft', 'Rejected'].includes(forecast.status)) {
        await t.rollback();
        return { status: false, message: 'Only Draft or Rejected forecasts can be updated directly', code: 400 };
      }

      const detailSchema = Joi.object({
        id: Joi.number().integer().optional(),
        part_id: Joi.number().integer().required(),
        period_date: Joi.date().iso().optional().allow(null, ''),
        forecast_qty: Joi.number().integer().min(0).required()
      });

      const schema = Joi.object({
        details: Joi.array().items(detailSchema).required()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { details } = validation.value;

      if (details && details.length > 0) {
        const partIds = details.map(d => d.part_id);
        const parts = await SParts.findAll({
          where: { id: { [Op.in]: partIds } },
          attributes: ['id', 'part_number', 'min_qty_sell'],
          transaction: t
        });
        const partMap = new Map(parts.map(p => [p.id, p]));

        for (const d of details) {
          const part = partMap.get(d.part_id);
          if (!part) {
            await t.rollback();
            return { status: false, message: `Part with ID ${d.part_id} not found.`, code: 400 };
          }
          if (d.forecast_qty < part.min_qty_sell) {
            await t.rollback();
            return {
              status: false,
              message: `Forecast quantity for part ${part.part_number} (${d.forecast_qty}) is less than the minimum sales quantity of ${part.min_qty_sell}.`,
              code: 400
            };
          }
        }
      }

      const oldData = JSON.parse(JSON.stringify(forecast));

      const existingDetails = await SSalesForecastDetails.findAll({
        where: { forecast_id: forecast.id },
        transaction: t
      });

      const existingIds = existingDetails.map(d => d.id);
      const updatedIds = details.filter(d => d.id).map(d => d.id);
      const idsToDelete = existingIds.filter(id => !updatedIds.includes(id));

      // Validation: Prevent deletion of 'Fix' records (Except if it's still Draft or Rejected)
      const fixedDetailsToDelete = existingDetails.filter(ed => idsToDelete.includes(ed.id) && ed.qty_status === 'Fix');
      if (!['Draft', 'Rejected'].includes(forecast.status) && fixedDetailsToDelete.length > 0) {
        await t.rollback();
        return {
          status: false,
          message: `Cannot delete records with 'Fix' status.`,
          code: 400
        };
      }

      if (idsToDelete.length > 0) {
        await SSalesForecastDetails.destroy({
          where: { id: { [Op.in]: idsToDelete } },
          transaction: t
        });
      }

      let maxDetailSeq = existingDetails.length;
      const currentMonthStr = dayjs().format('YYYY-MM');
      const is4Month = forecast.forecast_type === '4-Month';
      let totalQty = 0;

      for (const detail of details) {
        // Validation: Prevent quantity change for 'Fix' records (Except if it's still Draft or Rejected)
        if (detail.id) {
          const existingDetail = existingDetails.find(ed => ed.id === detail.id);
          if (!['Draft', 'Rejected'].includes(forecast.status) && existingDetail && existingDetail.qty_status === 'Fix') {
            if (Number(existingDetail.forecast_qty) !== Number(detail.forecast_qty)) {
              await t.rollback();
              return {
                status: false,
                message: `Cannot change quantity for a 'Fix' period (Part ID: ${existingDetail.part_id}, Date: ${existingDetail.period_date}).`,
                code: 400
              };
            }
          }
        }

        totalQty += detail.forecast_qty;

        const effectivePeriodDate = is4Month ? detail.period_date : forecast.start_period;
        let calculatedQtyStatus;
        if (forecast.forecast_type === 'Yearly' || forecast.forecast_type === 'Half-Year') {
          calculatedQtyStatus = 'Temporary';
        } else {
          const periodMonthStr = dayjs(effectivePeriodDate).format('YYYY-MM');
          if (periodMonthStr <= currentMonthStr) {
            calculatedQtyStatus = 'Fix';
          } else {
            calculatedQtyStatus = 'Temporary';
          }
        }

        if (detail.id) {
          // Update
          await SSalesForecastDetails.update({
            part_id: detail.part_id,
            period_date: effectivePeriodDate,
            qty_status: calculatedQtyStatus,
            forecast_qty: detail.forecast_qty
          }, {
            where: { id: detail.id, forecast_id: forecast.id },
            transaction: t
          });
        } else {
          // Insert
          maxDetailSeq++;
          await SSalesForecastDetails.create({
            forecast_id: forecast.id,
            forecast_detail_number: `${forecast.forecast_number}-D${maxDetailSeq.toString().padStart(3, '0')}`,
            part_id: detail.part_id,
            period_date: effectivePeriodDate,
            qty_status: calculatedQtyStatus,
            forecast_qty: detail.forecast_qty
          }, { transaction: t });
        }
      }

      // Log update
      await SSalesForecastLogs.create({
        forecast_id: forecast.id,
        version: forecast.version,
        total_qty: totalQty,
        action: 'Updated Details',
        remarks: 'Updated forecast details grid',
        changed_by: currentUser.id
      }, { transaction: t });

      // Audit Log
      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'UPDATE_FORECAST_DETAILS',
        resourceId: forecast.id,
        oldData,
        newData: { ...forecast.toJSON(), details },
        description: `Updated details for forecast ${forecast.forecast_number}`,
        transaction: t
      });

      await t.commit();
      return {
        status: true,
        message: 'Forecast details updated successfully'
      };
    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async deleteDraft(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const currentUser = req.user;

      const forecast = await SSalesForecasts.findByPk(id, { transaction: t });
      if (!forecast) {
        await t.rollback();
        return { status: false, message: 'Forecast not found', code: 404 };
      }

      if (forecast.status !== 'Draft') {
        await t.rollback();
        return { status: false, message: 'Only Draft forecasts can be deleted', code: 400 };
      }

      const oldData = JSON.parse(JSON.stringify(forecast));
      const timestamp = Date.now();

      // Update unique constraint column to avoid collision
      await forecast.update({
        forecast_number: `${forecast.forecast_number}_DEL_${timestamp}`
      }, { transaction: t });

      // Soft delete details and update their unique column
      const details = await SSalesForecastDetails.findAll({ where: { forecast_id: id }, transaction: t });
      for (const d of details) {
        await d.update({
          forecast_detail_number: `${d.forecast_detail_number}_DEL_${timestamp}`
        }, { transaction: t });
      }

      await SSalesForecastDetails.destroy({ where: { forecast_id: id }, transaction: t });

      // Soft delete forecast
      await forecast.destroy({ transaction: t });

      // Log deletion
      await SSalesForecastLogs.create({
        forecast_id: forecast.id,
        version: forecast.version,
        total_qty: 0,
        action: 'Deleted Draft',
        remarks: 'Deleted draft forecast',
        changed_by: currentUser.id
      }, { transaction: t });

      // Audit Log
      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'DELETE_FORECAST_DRAFT',
        resourceId: forecast.id,
        oldData,
        description: `Deleted forecast draft ${forecast.forecast_number}`,
        transaction: t
      });

      await t.commit();
      return {
        status: true,
        message: 'Forecast draft deleted successfully'
      };
    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return { status: false, error: error.message, code: 500 };
      }
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async submit(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const currentUser = req.user;

      const forecast = await SSalesForecasts.findByPk(id, {
        include: [
          {
            model: SSalesForecastDetails,
            as: 'details',
            include: [{ model: SParts, as: 'part', attributes: ['part_number', 'part_name'] }]
          }
        ],
        transaction: t
      });

      if (!forecast) {
        await t.rollback();
        return { status: false, message: 'Forecast not found', code: 404 };
      }

      if (!['Draft', 'Rejected'].includes(forecast.status)) {
        await t.rollback();
        return { status: false, message: `Only Draft or Rejected forecasts can be submitted. Current status: ${forecast.status}`, code: 400 };
      }

      const oldData = JSON.parse(JSON.stringify(forecast));
      const currentTotalQty = forecast.details.reduce((sum, d) => sum + d.forecast_qty, 0);

      if (forecast.details.length === 0) {
        await t.rollback();
        return { status: false, message: 'Forecast details cannot be empty.', code: 400 };
      }

      if (currentTotalQty <= 0) {
        await t.rollback();
        return { status: false, message: 'Total forecast quantity must be greater than 0.', code: 400 };
      }

      const updates = { status: 'Submitted' };

      if (forecast.status === 'Rejected') {
        const lastRejectedLog = await SSalesForecastLogs.findOne({
          where: { forecast_id: id, action: 'Rejected' },
          order: [['created_at', 'DESC']],
          transaction: t
        });

        if (lastRejectedLog && Number(lastRejectedLog.total_qty) === Number(currentTotalQty)) {
          await t.rollback();
          return {
            status: false,
            message: 'Quantity must be modified before resubmitting.',
            code: 400
          };
        }
        updates.version = this._incrementVersion(forecast.version);
      }

      await forecast.update(updates, { transaction: t });

      // Create snapshot of details
      const detailsSnapshot = JSON.stringify(forecast.details.map(d => ({
        part_id: d.part_id,
        part_number: d.part?.part_number,
        part_name: d.part?.part_name,
        period_date: d.period_date,
        qty_status: d.qty_status,
        forecast_qty: d.forecast_qty
      })));

      // Log action
      await SSalesForecastLogs.create({
        forecast_id: forecast.id,
        version: forecast.version,
        total_qty: currentTotalQty,
        action: 'Submitted',
        remarks: 'Forecast submitted for review',
        details_snapshot: detailsSnapshot,
        changed_by: currentUser.id
      }, { transaction: t });

      // Audit Log
      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'FORECAST_SUBMITTED',
        resourceId: forecast.id,
        oldData,
        newData: forecast,
        description: `Forecast ${forecast.forecast_number} submitted`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'Forecast submitted successfully', data: forecast };

    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async review(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const { status, remarks } = req.body; // status: 'Approved' or 'Rejected'
      const currentUser = req.user;

      if (!['Approved', 'Rejected'].includes(status)) {
        await t.rollback();
        return { status: false, message: 'Invalid status. Must be Approved or Rejected', code: 400 };
      }

      const forecast = await SSalesForecasts.findByPk(id, {
        include: [{ model: SSalesForecastDetails, as: 'details' }],
        transaction: t
      });

      if (!forecast) {
        await t.rollback();
        return { status: false, message: 'Forecast not found', code: 404 };
      }

      if (forecast.status !== 'Submitted' && forecast.status !== 'Draft') {
        await t.rollback();
        return { status: false, message: `Cannot approve/reject a forecast with status: ${forecast.status}`, code: 400 };
      }

      const oldData = JSON.parse(JSON.stringify(forecast));

      await forecast.update({
        status,
        approved_by: currentUser.id,
        approved_at: new Date()
      }, { transaction: t });

      // Log action
      await SSalesForecastLogs.create({
        forecast_id: forecast.id,
        version: forecast.version,
        total_qty: forecast.details.reduce((sum, d) => sum + d.forecast_qty, 0),
        action: status,
        remarks: remarks || `Forecast ${status}`,
        changed_by: currentUser.id
      }, { transaction: t });

      // Trigger SPR if Approved
      if (status === 'Approved' && forecast.forecast_type === '4-Month') {
        await this._generateSPR(forecast, t);
      }

      // Audit Log
      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: `FORECAST_${status.toUpperCase()}`,
        resourceId: forecast.id,
        oldData,
        newData: forecast,
        description: `Forecast ${forecast.forecast_number} ${status}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: `Forecast has been ${status}`, data: forecast };

    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async _generateSPR(forecast, transaction) {
    const currentMonthStr = dayjs().format('YYYY-MM');

    // Get details with qty_status = 'Fix' (Locked) for the current month
    const details = await SSalesForecastDetails.findAll({
      where: {
        forecast_id: forecast.id,
        qty_status: 'Fix',
        period_date: {
          [Op.between]: [
            dayjs().startOf('month').format('YYYY-MM-DD'),
            dayjs().endOf('month').format('YYYY-MM-DD')
          ]
        }
      },
      transaction
    });

    if (details.length === 0) return; // No locked details, skip SPR generation

    // Aggregate qty per part_id
    const partAggregations = {};
    for (const d of details) {
      if (!partAggregations[d.part_id]) {
        partAggregations[d.part_id] = 0;
      }
      partAggregations[d.part_id] += d.forecast_qty;
    }

    // Generate SPR Number
    const prefix = `SPR-${currentMonthStr}`;
    const lastSPR = await SSalesPurchaseRequests.findOne({
      where: {
        spr_number: { [Op.like]: `${prefix}-%` }
      },
      order: [['spr_number', 'DESC']],
      transaction,
      paranoid: false
    });

    let seq = 1;
    if (lastSPR) {
      const parts = lastSPR.spr_number.split('-');
      const lastSeqStr = parts[parts.length - 1];
      if (!isNaN(lastSeqStr)) {
        seq = parseInt(lastSeqStr, 10) + 1;
      }
    }
    const spr_number = `${prefix}-${seq.toString().padStart(4, '0')}`;

    // Calculate required date (e.g., end of month)
    const required_date = dayjs().endOf('month').format('YYYY-MM-DD');

    const spr = await SSalesPurchaseRequests.create({
      spr_number,
      spr_name: `SPR Auto from ${forecast.forecast_number}`,
      source: 'Automatic',
      forecast_id: forecast.id,
      request_date: dayjs().format('YYYY-MM-DD'),
      required_date,
      description: `Auto-generated from Approved Forecast ${forecast.forecast_number}`,
      status: 'Approved',
      created_by: forecast.approved_by
    }, { transaction });

    // Create details
    const detailRecords = [];
    for (const [part_id, qty] of Object.entries(partAggregations)) {
      if (qty > 0) {
        detailRecords.push({
          spr_id: spr.id,
          part_id: parseInt(part_id, 10),
          qty
        });
      }
    }

    if (detailRecords.length > 0) {
      await SSalesPurchaseRequestDetails.bulkCreate(detailRecords, { transaction });
    }

    // Log creation
    await SSalesPurchaseRequestLogs.create({
      spr_id: spr.id,
      status: 'Approved',
      action: 'Created (Auto)',
      remarks: `Automatically generated from forecast ${forecast.forecast_number}`,
      changed_by: forecast.approved_by
    }, { transaction });
  }
}

export default new ForecastModule();
