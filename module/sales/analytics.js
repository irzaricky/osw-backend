import db from '../../models/index.js';
import { Op } from 'sequelize';
import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import { config } from '../../config/app.config.js';

const {
  SSalesPurchaseOrders, SSalesPurchaseOrderDetails,
  SDeliveryOrders, SDeliveryOrderDetails,
  SDeliveryPlans, SDeliveryPlanDetails,
  SSalesForecasts, SSalesForecastDetails,
  SDocks, SWarehouses, SCustomers, SVehicles, SUserDetail,
  SParts, SSalesPurchaseRequests, SSalesPurchaseRequestLogs
} = db;

class AnalyticsModule extends BaseModule {
  /**
   * GET /sales/analytics/summary
   * Returns KPI summary metrics for the given date range (default last 30 days)
   */
  async getSummary(req) {
    try {
      const { start_date, end_date } = req.query;

      // Default last 30 days in WIB timezone
      const startDateStr = start_date 
        ? dayjs(start_date).format('YYYY-MM-DD') 
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date 
        ? dayjs(end_date).format('YYYY-MM-DD') 
        : dayjs().format('YYYY-MM-DD');

      // 1. Total SPOs count and ordered items quantity
      const spos = await SSalesPurchaseOrders.findAll({
        where: {
          spo_date: {
            [Op.between]: [startDateStr, endDateStr]
          }
        },
        include: [{
          model: SSalesPurchaseOrderDetails,
          as: 'details',
          attributes: ['ordered_qty', 'sent_qty']
        }]
      });

      let totalSpos = spos.length;
      let totalOrderedQty = 0;
      let totalSentQty = 0;
      for (const spo of spos) {
        if (spo.details) {
          for (const det of spo.details) {
            totalOrderedQty += det.ordered_qty || 0;
            totalSentQty += det.sent_qty || 0;
          }
        }
      }

      // 2. SDO count grouped by delivery status
      const sdos = await SDeliveryOrders.findAll({
        where: {
          shipment_date: {
            [Op.between]: [startDateStr, endDateStr]
          }
        }
      });

      const sdoCounts = {
        Created: 0,
        Loading: 0,
        'In Transit': 0,
        Delivered: 0
      };

      for (const sdo of sdos) {
        const status = sdo.delivery_status || 'Created';
        if (sdoCounts[status] !== undefined) {
          sdoCounts[status]++;
        } else {
          sdoCounts[status] = (sdoCounts[status] || 0) + 1;
        }
      }

      // 3. Active SDP counts (Draft & Scheduled plans)
      const sdps = await SDeliveryPlans.findAll({
        where: {
          scheduled_date: {
            [Op.between]: [startDateStr, endDateStr]
          }
        }
      });

      let activeSdps = 0;
      for (const sdp of sdps) {
        if (['Draft', 'Scheduled'].includes(sdp.status)) {
          activeSdps++;
        }
      }

      // 4. Dock util hours occupancy
      const dockPlans = await SDeliveryPlans.findAll({
        where: {
          scheduled_date: {
            [Op.between]: [startDateStr, endDateStr]
          }
        },
        include: [{
          model: SDocks,
          as: 'dock',
          attributes: ['id', 'name']
        }]
      });

      const dockUtilization = {};
      for (const p of dockPlans) {
        if (!p.dock) continue;
        const dockId = p.dock.id;
        const dockName = p.dock.name;

        let hours = 0;
        if (p.time_start && p.time_end) {
          const ms = helper.clockHMSDiff(p.time_start, p.time_end);
          hours = helper.round(ms / 3600000, 2);
        }

        if (!dockUtilization[dockId]) {
          dockUtilization[dockId] = {
            id: dockId,
            name: dockName,
            total_hours: 0,
            plan_count: 0,
            plans: []
          };
        }
        dockUtilization[dockId].total_hours += hours;
        dockUtilization[dockId].plan_count += 1;
        dockUtilization[dockId].plans.push({
          id: p.id,
          dp_number: p.dp_number,
          scheduled_date: p.scheduled_date,
          time_start: p.time_start,
          time_end: p.time_end,
          hours: hours
        });
      }

      const daysCount = Math.max(dayjs(endDateStr).diff(dayjs(startDateStr), 'day') + 1, 1);
      for (const id in dockUtilization) {
        const total = dockUtilization[id].total_hours;
        dockUtilization[id].avg_daily_hours = helper.round(total / daysCount, 2);
        dockUtilization[id].total_hours = helper.round(total, 2);
      }

      const summary = {
        date_range: {
          start: startDateStr,
          end: endDateStr
        },
        kpis: {
          total_spos: totalSpos,
          total_ordered_qty: totalOrderedQty,
          total_sent_qty: totalSentQty,
          active_plans_count: activeSdps,
          total_plans_count: sdps.length,
          sdo_status_counts: sdoCounts
        },
        dock_utilization: Object.values(dockUtilization)
      };

      return { status: true, data: summary };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * GET /sales/analytics/trends
   * Returns sorted monthly statistics for the last 12 months
   */
  async getTrends(req) {
    try {
      const monthsList = [];
      for (let i = 11; i >= 0; i--) {
        monthsList.push(dayjs().subtract(i, 'month').format('YYYY-MM'));
      }

      const startTrendsDate = dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD');
      const endTrendsDate = dayjs().endOf('month').format('YYYY-MM-DD');

      const [sposTrends, sdosTrends, sdpsTrends] = await Promise.all([
        SSalesPurchaseOrders.findAll({
          where: {
            spo_date: {
              [Op.between]: [startTrendsDate, endTrendsDate]
            }
          }
        }),
        SDeliveryOrders.findAll({
          where: {
            delivery_status: 'Delivered',
            shipment_date: {
              [Op.between]: [startTrendsDate, endTrendsDate]
            }
          },
          include: [{
            model: SDeliveryOrderDetails,
            as: 'details',
            attributes: ['sent_qty', 'received_qty']
          }]
        }),
        SDeliveryPlans.findAll({
          where: {
            scheduled_date: {
              [Op.between]: [startTrendsDate, endTrendsDate]
            }
          },
          include: [{
            model: SDeliveryPlanDetails,
            as: 'details',
            attributes: ['planned_qty']
          }]
        })
      ]);

      const trendsMap = {};
      for (const month of monthsList) {
        trendsMap[month] = {
          month,
          spo_count: 0,
          sdo_delivered_count: 0,
          planned_qty: 0,
          received_qty: 0
        };
      }

      for (const spo of sposTrends) {
        const month = dayjs(spo.spo_date).format('YYYY-MM');
        if (trendsMap[month]) {
          trendsMap[month].spo_count++;
        }
      }

      for (const sdo of sdosTrends) {
        const month = dayjs(sdo.shipment_date).format('YYYY-MM');
        if (trendsMap[month]) {
          trendsMap[month].sdo_delivered_count++;
          if (sdo.details) {
            for (const d of sdo.details) {
              trendsMap[month].received_qty += d.received_qty || 0;
            }
          }
        }
      }

      for (const sdp of sdpsTrends) {
        const month = dayjs(sdp.scheduled_date).format('YYYY-MM');
        if (trendsMap[month]) {
          if (sdp.details) {
            for (const d of sdp.details) {
              trendsMap[month].planned_qty += d.planned_qty || 0;
            }
          }
        }
      }

      const trendsList = monthsList.map(month => trendsMap[month]);

      return { status: true, data: trendsList };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * GET /sales/analytics/export
   * Generates a beautifully styled Excel report containing delivery details
   */
  async exportSDODetails(req, res) {
    try {
      const { start_date, end_date } = req.query;

      const startDateStr = start_date 
        ? dayjs(start_date).format('YYYY-MM-DD') 
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date 
        ? dayjs(end_date).format('YYYY-MM-DD') 
        : dayjs().format('YYYY-MM-DD');

      const sdos = await SDeliveryOrders.findAll({
        where: {
          shipment_date: {
            [Op.between]: [startDateStr, endDateStr]
          }
        },
        include: [
          { model: SCustomers, as: 'customer', attributes: ['name'] },
          { model: SVehicles, as: 'vehicle', attributes: ['plate_number'] },
          { model: SUserDetail, as: 'driver', attributes: ['full_name'] },
          { model: SDeliveryOrderDetails, as: 'details', attributes: ['sent_qty', 'received_qty'] }
        ],
        order: [['shipment_date', 'DESC'], ['do_number', 'DESC']]
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('SDO Transit Report');
      worksheet.views = [{ showGridLines: true }];

      // 1. Report Title Blocks
      worksheet.mergeCells('A1:J1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'Sales Delivery Order Shipment Report';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: '312E81' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 30;

      worksheet.mergeCells('A2:J2');
      const dateCell = worksheet.getCell('A2');
      dateCell.value = `Date Filter Range: ${startDateStr} to ${endDateStr}`;
      dateCell.font = { name: 'Arial', size: 10, italic: true };
      dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells('A3:J3');
      const genCell = worksheet.getCell('A3');
      genCell.value = `Generated Date: ${dayjs().format('DD/MM/YYYY HH:mm:ss')} WIB`;
      genCell.font = { name: 'Arial', size: 9, color: { argb: '4B5563' } };
      genCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Empty row 4
      worksheet.getRow(4).height = 15;

      // 2. Data Grid Header Definitions
      const headerRow = worksheet.getRow(5);
      headerRow.height = 25;
      
      const columns = [
        { header: 'No. DO', key: 'do_number', width: 22 },
        { header: 'Planned Date', key: 'plan_date', width: 18 },
        { header: 'Shipment Date', key: 'shipment_date', width: 18 },
        { header: 'Pelanggan', key: 'customer_name', width: 25 },
        { header: 'Armada (Plat)', key: 'vehicle_plate', width: 15 },
        { header: 'Pengemudi', key: 'driver_name', width: 22 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Qty Kirim', key: 'sent_qty', width: 15 },
        { header: 'Qty Diterima', key: 'received_qty', width: 15 },
        { header: 'Fulfillment Rate', key: 'fulfillment_rate', width: 18 }
      ];

      worksheet.columns = columns;

      // Set headers on Row 5 explicitly
      columns.forEach((col, index) => {
        headerRow.getCell(index + 1).value = col.header;
      });

      // Style header columns explicitly
      for (let col = 1; col <= 10; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '312E81' } // Dark Indigo premium theme color
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: '9CA3AF' } },
          bottom: { style: 'medium', color: { argb: '1E1B4B' } },
          left: { style: 'thin', color: { argb: '9CA3AF' } },
          right: { style: 'thin', color: { argb: '9CA3AF' } }
        };
      }

      // 3. Populate Rows
      let currentRowIdx = 6;
      for (const sdo of sdos) {
        let totalSent = 0;
        let totalReceived = 0;
        if (sdo.details) {
          for (const d of sdo.details) {
            totalSent += d.sent_qty || 0;
            totalReceived += d.received_qty || 0;
          }
        }

        const planDate = sdo.shipment_date 
          ? dayjs(sdo.shipment_date).format('DD/MM/YYYY') 
          : '-';
        const recvDate = sdo.received_at 
          ? dayjs(sdo.received_at).format('DD/MM/YYYY HH:mm') 
          : '-';

        const rowData = {
          do_number: sdo.do_number,
          plan_date: planDate,
          shipment_date: recvDate,
          customer_name: sdo.customer?.name || '-',
          vehicle_plate: sdo.vehicle?.plate_number || '-',
          driver_name: sdo.driver?.full_name || '-',
          status: sdo.delivery_status || 'Draft',
          sent_qty: totalSent,
          received_qty: sdo.delivery_status === 'Delivered' ? totalReceived : '-',
          fulfillment_rate: totalSent > 0 && sdo.delivery_status === 'Delivered'
            ? totalReceived / totalSent
            : 0
        };

        const row = worksheet.addRow(rowData);
        row.height = 20;

        // Apply borders and alignments
        for (let col = 1; col <= 10; col++) {
          const cell = row.getCell(col);
          cell.font = { name: 'Arial', size: 9 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
            left: { style: 'thin', color: { argb: 'E5E7EB' } },
            right: { style: 'thin', color: { argb: 'E5E7EB' } }
          };
          
          // Alignment overrides
          if ([1, 2, 3, 5, 7].includes(col)) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if ([4, 6].includes(col)) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }

          // Number Formats
          if ([8, 9].includes(col)) {
            cell.numFmt = '#,##0';
          }
          if (col === 10) {
            if (sdo.delivery_status === 'Delivered') {
              cell.numFmt = '0.0%';
            } else {
              cell.value = '-';
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }
          }
        }

        // Color badge status cell
        const statusCell = row.getCell(7);
        const status = sdo.delivery_status || 'Draft';
        let statusColors = { bg: 'F3F4F6', fg: '374151' }; // Draft defaults

        if (status === 'Delivered') {
          statusColors = { bg: 'D1FAE5', fg: '065F46' };
        } else if (status === 'In Transit') {
          statusColors = { bg: 'DBEAFE', fg: '1E40AF' };
        } else if (status === 'Scheduled') {
          statusColors = { bg: 'FEF3C7', fg: '92400E' };
        }

        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: statusColors.bg }
        };
        statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: statusColors.fg } };

        currentRowIdx++;
      }

      // 4. Send Response Binary Stream
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=SDO_Shipment_Report_${startDateStr}_${endDateStr}.xlsx`);
      
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Excel Export Error:', error);
      res.status(500).json({ status: false, error: error.message });
    }
  }

  /**
   * GET /sales/analytics/sla
   * Returns on-time vs delayed SDO deliveries (SLA = shipment_date + 24h)
   */
  async getSlaMetrics(req) {
    try {
      const { start_date, end_date } = req.query;
      const startDateStr = start_date
        ? dayjs(start_date).format('YYYY-MM-DD')
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date
        ? dayjs(end_date).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD');

      const sdos = await SDeliveryOrders.findAll({
        where: {
          delivery_status: 'Delivered',
          shipment_date: { [Op.between]: [startDateStr, endDateStr] }
        },
        attributes: ['shipment_date', 'received_at']
      });

      let on_time = 0;
      let delayed = 0;
      for (const sdo of sdos) {
        if (!sdo.received_at) continue;
        const sla_deadline = dayjs(sdo.shipment_date).add(1, 'day');
        if (dayjs(sdo.received_at).isBefore(sla_deadline) || dayjs(sdo.received_at).isSame(sla_deadline)) {
          on_time++;
        } else {
          delayed++;
        }
      }

      const total = on_time + delayed;
      const on_time_rate = total > 0 ? helper.round(on_time / total, 4) : 0;

      return { status: true, data: { on_time, delayed, total, on_time_rate } };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * GET /sales/analytics/forecast-vs-spo
   * Returns last 6 months of forecast monthly target vs SPO actual ordered qty
   */
  async getForecastVsSpo(req) {
    try {
      const monthsList = [];
      for (let i = 5; i >= 0; i--) {
        monthsList.push(dayjs().subtract(i, 'month').format('YYYY-MM'));
      }

      // Fetch all non-draft/rejected forecasts
      const forecasts = await SSalesForecasts.findAll({
        where: {
          status: { [Op.notIn]: ['Draft', 'Rejected'] }
        },
        include: [{
          model: SSalesForecastDetails,
          as: 'details',
          attributes: ['fix_qty', 'temporary_qty']
        }],
        attributes: ['id', 'forecast_type', 'start_period', 'end_period']
      });

      // Fetch SPOs for the 6-month window
      const windowStart = dayjs().subtract(5, 'month').startOf('month').format('YYYY-MM-DD');
      const windowEnd = dayjs().endOf('month').format('YYYY-MM-DD');

      const spos = await SSalesPurchaseOrders.findAll({
        where: {
          spo_date: { [Op.between]: [windowStart, windowEnd] }
        },
        include: [{
          model: SSalesPurchaseOrderDetails,
          as: 'details',
          attributes: ['ordered_qty']
        }]
      });

      // Build month map
      const result = {};
      for (const month of monthsList) {
        result[month] = { month, forecast_target: 0, spo_actual: 0 };
      }

      // Compute monthly forecast target
      const typeMonthMap = { 'Yearly': 12, 'Half-Year': 6, '4-Month': 4 };
      for (const forecast of forecasts) {
        const divisor = typeMonthMap[forecast.forecast_type] || 12;
        // Total qty from details (fix + temporary)
        let totalQty = 0;
        for (const d of (forecast.details || [])) {
          totalQty += (d.fix_qty || 0) + (d.temporary_qty || 0);
        }
        const monthlyShare = helper.round(totalQty / divisor, 2);

        // Add share to each month that overlaps forecast period
        for (const month of monthsList) {
          const monthStart = dayjs(month + '-01');
          const monthEnd = monthStart.endOf('month');
          const forecastStart = dayjs(forecast.start_period);
          const forecastEnd = dayjs(forecast.end_period);
          if (monthStart.isBefore(forecastEnd) && monthEnd.isAfter(forecastStart)) {
            result[month].forecast_target += monthlyShare;
          }
        }
      }

      // Compute SPO actual per month
      for (const spo of spos) {
        const month = dayjs(spo.spo_date).format('YYYY-MM');
        if (result[month]) {
          for (const d of (spo.details || [])) {
            result[month].spo_actual += d.ordered_qty || 0;
          }
        }
      }

      // Round forecast targets
      for (const month of monthsList) {
        result[month].forecast_target = helper.round(result[month].forecast_target, 0);
      }

      return { status: true, data: monthsList.map(m => result[m]) };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * GET /sales/analytics/top-customers
   * Returns top 5 customers by total ordered_qty in the date range
   */
  async getTopCustomers(req) {
    try {
      const { start_date, end_date } = req.query;
      const startDateStr = start_date
        ? dayjs(start_date).format('YYYY-MM-DD')
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date
        ? dayjs(end_date).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD');

      const spos = await SSalesPurchaseOrders.findAll({
        where: {
          spo_date: { [Op.between]: [startDateStr, endDateStr] }
        },
        include: [
          { model: SCustomers, as: 'customer', attributes: ['id', 'name'] },
          { model: SSalesPurchaseOrderDetails, as: 'details', attributes: ['ordered_qty'] }
        ]
      });

      // Aggregate by customer
      const customerMap = {};
      for (const spo of spos) {
        if (!spo.customer) continue;
        const cid = spo.customer.id;
        if (!customerMap[cid]) {
          customerMap[cid] = { customer_id: cid, customer_name: spo.customer.name, total_ordered_qty: 0 };
        }
        for (const d of (spo.details || [])) {
          customerMap[cid].total_ordered_qty += d.ordered_qty || 0;
        }
      }

      const topCustomers = Object.values(customerMap)
        .sort((a, b) => b.total_ordered_qty - a.total_ordered_qty)
        .slice(0, 5);

      return { status: true, data: topCustomers };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * GET /sales/analytics/forecast
   * Returns Forecast Analytics KPI cards and trends
   */
  async getForecastAnalytics(req) {
    try {
      const { start_date, end_date } = req.query;

      const startDateStr = start_date 
        ? dayjs(start_date).format('YYYY-MM-DD') 
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date 
        ? dayjs(end_date).format('YYYY-MM-DD') 
        : dayjs().format('YYYY-MM-DD');

      // 1. Total Forecasted Volume
      const totalVolumeResult = await SSalesForecastDetails.findOne({
        where: {
          period_date: {
            [Op.between]: [startDateStr, endDateStr]
          }
        },
        include: [{
          model: SSalesForecasts,
          as: 'forecast',
          where: { status: 'Approved' },
          attributes: []
        }],
        attributes: [
          [db.sequelize.fn('SUM', db.sequelize.col('forecast_qty')), 'total_volume']
        ],
        raw: true
      });
      const totalVolume = parseInt(totalVolumeResult?.total_volume || 0, 10);

      // 2. Total Active Versions
      const activeVersionsCount = await SSalesForecasts.count({
        where: {
          status: { [Op.in]: ['Draft', 'Submitted'] },
          start_period: { [Op.lte]: endDateStr },
          end_period: { [Op.gte]: startDateStr }
        }
      });

      // 3. Forecast Accuracy Rate & Trends
      const details = await SSalesForecastDetails.findAll({
        where: {
          period_date: {
            [Op.between]: [startDateStr, endDateStr]
          }
        },
        include: [{
          model: SSalesForecasts,
          as: 'forecast',
          where: { status: 'Approved' },
          attributes: ['customer_id', 'forecast_type']
        }],
        attributes: ['part_id', 'period_date', 'qty_status', 'forecast_qty']
      });

      const groups = {};
      for (const d of details) {
        if (!d.forecast) continue;
        const custId = d.forecast.customer_id;
        const partId = d.part_id;
        const pDate = dayjs(d.period_date).format('YYYY-MM-DD');
        const key = `${custId}:${partId}:${pDate}`;
        if (!groups[key]) {
          groups[key] = {
            customer_id: custId,
            part_id: partId,
            period_date: pDate,
            fixQty: 0,
            tempQty: 0,
            tempDetails: []
          };
        }
        if (d.qty_status === 'Fix') {
          groups[key].fixQty += d.forecast_qty || 0;
        } else if (d.qty_status === 'Temporary') {
          groups[key].tempQty += d.forecast_qty || 0;
          groups[key].tempDetails.push({
            qty: d.forecast_qty || 0,
            forecast_type: d.forecast.forecast_type
          });
        }
      }

      let totalAccuracySum = 0;
      let accuracyCount = 0;

      for (const key in groups) {
        const g = groups[key];
        if (g.fixQty > 0) {
          for (const temp of g.tempDetails) {
            const error = Math.abs(g.fixQty - temp.qty) / Math.max(g.fixQty, temp.qty);
            const accuracy = (1 - error) * 100;
            totalAccuracySum += accuracy;
            accuracyCount++;
          }
        }
      }

      const accuracyRate = accuracyCount > 0 ? helper.round(totalAccuracySum / accuracyCount, 2) : 100;

      // 4. Forecast vs Actual Trends (Line Chart)
      const trendsMap = {};
      let currentMonth = dayjs(startDateStr).startOf('month');
      const endMonth = dayjs(endDateStr).startOf('month');
      while (currentMonth.isBefore(endMonth) || currentMonth.isSame(endMonth)) {
        const mStr = currentMonth.format('YYYY-MM');
        trendsMap[mStr] = {
          month: mStr,
          temporary_qty: 0,
          fix_qty: 0
        };
        currentMonth = currentMonth.add(1, 'month');
      }

      for (const key in groups) {
        const g = groups[key];
        const mStr = dayjs(g.period_date).format('YYYY-MM');
        if (trendsMap[mStr]) {
          trendsMap[mStr].fix_qty += g.fixQty;
          trendsMap[mStr].temporary_qty += g.tempQty;
        }
      }
      const trendsList = Object.values(trendsMap).sort((a, b) => a.month.localeCompare(b.month));

      // 5. Top Forecasted Products (Bar Chart)
      const topProductsResult = await SSalesForecastDetails.findAll({
        where: {
          period_date: {
            [Op.between]: [startDateStr, endDateStr]
          }
        },
        include: [
          {
            model: SSalesForecasts,
            as: 'forecast',
            where: { status: 'Approved' },
            attributes: []
          },
          {
            model: SParts,
            as: 'part',
            attributes: ['part_number', 'part_name']
          }
        ],
        attributes: [
          'part_id',
          [db.sequelize.fn('SUM', db.sequelize.col('forecast_qty')), 'total_qty']
        ],
        group: ['part_id', 'part.id', 'part.part_number', 'part.part_name'],
        order: [[db.sequelize.fn('SUM', db.sequelize.col('forecast_qty')), 'DESC']],
        limit: 5
      });

      const topProducts = topProductsResult.map(item => ({
        part_id: item.part_id,
        part_number: item.part?.part_number || '-',
        part_name: item.part?.part_name || '-',
        total_qty: parseInt(item.getDataValue('total_qty') || 0, 10)
      }));

      return {
        status: true,
        data: {
          date_range: {
            start: startDateStr,
            end: endDateStr
          },
          kpis: {
            total_volume: totalVolume,
            active_versions: activeVersionsCount,
            accuracy_rate: accuracyRate
          },
          trends: trendsList,
          top_products: topProducts
        }
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * GET /sales/analytics/spr
   * Returns SPR Analytics KPI cards, status breakdown, and funnel metrics
   */
  async getSprAnalytics(req) {
    try {
      const { start_date, end_date } = req.query;

      const startDateStr = start_date 
        ? dayjs(start_date).format('YYYY-MM-DD') 
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date 
        ? dayjs(end_date).format('YYYY-MM-DD') 
        : dayjs().format('YYYY-MM-DD');

      // 1. Total Active SPRs (status: 'Submitted')
      const activeSprsCount = await SSalesPurchaseRequests.count({
        where: {
          status: 'Submitted',
          request_date: { [Op.between]: [startDateStr, endDateStr] }
        }
      });

      // 2. Avg Approval Time
      const approvedSprs = await SSalesPurchaseRequests.findAll({
        where: {
          status: 'Approved',
          request_date: { [Op.between]: [startDateStr, endDateStr] }
        },
        include: [{
          model: SSalesPurchaseRequestLogs,
          as: 'logs',
          attributes: ['status', 'created_at']
        }]
      });

      let totalApprovalTimeMs = 0;
      let approvedCount = 0;

      for (const spr of approvedSprs) {
        const approvedLog = spr.logs.find(l => l.status === 'Approved');
        const submittedLog = spr.logs.find(l => l.status === 'Submitted');

        if (approvedLog) {
          const end = dayjs(approvedLog.created_at);
          const start = submittedLog ? dayjs(submittedLog.created_at) : dayjs(spr.created_at);
          const diff = end.diff(start);
          if (diff > 0) {
            totalApprovalTimeMs += diff;
            approvedCount++;
          }
        }
      }

      const avgApprovalTimeHours = approvedCount > 0 
        ? helper.round((totalApprovalTimeMs / approvedCount) / 3600000, 2) 
        : 0;

      // 3. SPR Rejection Rate (%)
      const totalSprCount = await SSalesPurchaseRequests.count({
        where: {
          request_date: { [Op.between]: [startDateStr, endDateStr] }
        }
      });

      const rejectedSprCount = await SSalesPurchaseRequests.count({
        where: {
          status: 'Rejected',
          request_date: { [Op.between]: [startDateStr, endDateStr] }
        }
      });

      const rejectionRate = totalSprCount > 0 
        ? helper.round((rejectedSprCount / totalSprCount) * 100, 2) 
        : 0;

      // 4. Status Breakdown
      const statusBreakdownRaw = await SSalesPurchaseRequests.findAll({
        where: {
          request_date: { [Op.between]: [startDateStr, endDateStr] }
        },
        attributes: [
          'status',
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const statusBreakdown = {
        Draft: 0,
        Submitted: 0,
        Approved: 0,
        Rejected: 0
      };
      for (const item of statusBreakdownRaw) {
        if (statusBreakdown[item.status] !== undefined) {
          statusBreakdown[item.status] = parseInt(item.count, 10);
        }
      }

      // 5. Pipeline Funnel
      const sprsForFunnel = await SSalesPurchaseRequests.findAll({
        where: {
          request_date: { [Op.between]: [startDateStr, endDateStr] }
        },
        include: [{
          model: SSalesPurchaseOrders,
          as: 'orders',
          attributes: ['id']
        }]
      });

      let funnelCreated = sprsForFunnel.length;
      let funnelSubmitted = 0;
      let funnelApproved = 0;
      let funnelSPO = 0;

      for (const spr of sprsForFunnel) {
        if (['Submitted', 'Approved', 'Rejected'].includes(spr.status)) {
          funnelSubmitted++;
        }
        if (spr.status === 'Approved') {
          funnelApproved++;
          if (spr.orders && spr.orders.length > 0) {
            funnelSPO++;
          }
        }
      }

      const pipelineFunnel = [
        { stage: 'Draft Created', count: funnelCreated },
        { stage: 'Submitted', count: funnelSubmitted },
        { stage: 'Approved', count: funnelApproved },
        { stage: 'SPO Created', count: funnelSPO }
      ];

      return {
        status: true,
        data: {
          date_range: {
            start: startDateStr,
            end: endDateStr
          },
          kpis: {
            active_sprs: activeSprsCount,
            avg_approval_time: avgApprovalTimeHours,
            rejection_rate: rejectionRate
          },
          status_breakdown: statusBreakdown,
          pipeline_funnel: pipelineFunnel
        }
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }
}

export default new AnalyticsModule();
;
;
