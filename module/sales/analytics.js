import db from '../../models/index.js';
import { Op, QueryTypes } from 'sequelize';
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
  SParts, SSalesPurchaseRequests, SSalesPurchaseRequestDetails, SSalesPurchaseRequestLogs
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

  async exportForecastDetails(req, res) {
    try {
      const { start_date, end_date } = req.query;

      const startDateStr = start_date
        ? dayjs(start_date).format('YYYY-MM-DD')
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date
        ? dayjs(end_date).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD');

      const details = await SSalesForecastDetails.findAll({
        where: {
          period_date: {
            [Op.between]: [startDateStr, endDateStr]
          }
        },
        include: [
          {
            model: SSalesForecasts,
            as: 'forecast',
            include: [
              { model: SCustomers, as: 'customer', attributes: ['name'] }
            ]
          },
          {
            model: SParts,
            as: 'part',
            attributes: ['part_name', 'part_number']
          }
        ],
        order: [['period_date', 'ASC'], ['forecast_id', 'DESC']]
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Forecast Details');
      worksheet.views = [{ showGridLines: true }];

      // 1. Report Title Blocks
      worksheet.mergeCells('A1:G1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'Sales Forecast Details Report';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: '312E81' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 30;

      worksheet.mergeCells('A2:G2');
      const dateCell = worksheet.getCell('A2');
      dateCell.value = `Period Date Range: ${startDateStr} to ${endDateStr}`;
      dateCell.font = { name: 'Arial', size: 10, italic: true };
      dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells('A3:G3');
      const genCell = worksheet.getCell('A3');
      genCell.value = `Generated Date: ${dayjs().format('DD/MM/YYYY HH:mm:ss')} WIB`;
      genCell.font = { name: 'Arial', size: 9, color: { argb: '4B5563' } };
      genCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.getRow(4).height = 15;

      const headerRow = worksheet.getRow(5);
      headerRow.height = 25;

      const columns = [
        { header: 'Forecast No', key: 'forecast_number', width: 22 },
        { header: 'Customer', key: 'customer_name', width: 25 },
        { header: 'Part Name', key: 'part_name', width: 25 },
        { header: 'Part No', key: 'part_number', width: 20 },
        { header: 'Period Date', key: 'period_date', width: 18 },
        { header: 'Forecast Qty', key: 'forecast_qty', width: 15 },
        { header: 'Qty Status', key: 'qty_status', width: 15 }
      ];

      worksheet.columns = columns;

      columns.forEach((col, index) => {
        headerRow.getCell(index + 1).value = col.header;
      });

      for (let col = 1; col <= 7; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '312E81' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: '9CA3AF' } },
          bottom: { style: 'medium', color: { argb: '1E1B4B' } },
          left: { style: 'thin', color: { argb: '9CA3AF' } },
          right: { style: 'thin', color: { argb: '9CA3AF' } }
        };
      }

      for (const d of details) {
        const rowData = {
          forecast_number: d.forecast?.forecast_number || '-',
          customer_name: d.forecast?.customer?.name || '-',
          part_name: d.part?.part_name || '-',
          part_number: d.part?.part_number || '-',
          period_date: d.period_date ? dayjs(d.period_date).format('DD/MM/YYYY') : '-',
          forecast_qty: d.forecast_qty || 0,
          qty_status: d.qty_status || 'Temporary'
        };

        const row = worksheet.addRow(rowData);
        row.height = 20;

        for (let col = 1; col <= 7; col++) {
          const cell = row.getCell(col);
          cell.font = { name: 'Arial', size: 9 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
            left: { style: 'thin', color: { argb: 'E5E7EB' } },
            right: { style: 'thin', color: { argb: 'E5E7EB' } }
          };

          if ([1, 4, 5, 7].includes(col)) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if ([2, 3].includes(col)) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }

          if (col === 6) {
            cell.numFmt = '#,##0';
          }
        }

        const statusCell = row.getCell(7);
        const status = d.qty_status || 'Temporary';
        let statusColors = { bg: 'FEF3C7', fg: '92400E' }; // Temporary
        if (status === 'Fix') {
          statusColors = { bg: 'D1FAE5', fg: '065F46' };
        }

        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: statusColors.bg }
        };
        statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: statusColors.fg } };
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Forecast_Analytics_Report_${startDateStr}_${endDateStr}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Forecast Excel Export Error:', error);
      res.status(500).json({ status: false, error: error.message });
    }
  }

  async exportSprDetails(req, res) {
    try {
      const { start_date, end_date } = req.query;

      const startDateStr = start_date
        ? dayjs(start_date).format('YYYY-MM-DD')
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date
        ? dayjs(end_date).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD');

      const details = await SSalesPurchaseRequestDetails.findAll({
        include: [
          {
            model: SSalesPurchaseRequests,
            as: 'spr',
            where: {
              request_date: {
                [Op.between]: [startDateStr, endDateStr]
              }
            },
            include: [
              {
                model: SSalesForecasts,
                as: 'forecast',
                include: [{ model: SCustomers, as: 'customer', attributes: ['name'] }]
              }
            ]
          },
          {
            model: SParts,
            as: 'part',
            attributes: ['part_name', 'part_number', 'price']
          }
        ],
        order: [[{ model: SSalesPurchaseRequests, as: 'spr' }, 'request_date', 'ASC'], ['spr_id', 'DESC']]
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('SPR Details');
      worksheet.views = [{ showGridLines: true }];

      // 1. Report Title Blocks
      worksheet.mergeCells('A1:I1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'Sales Purchase Request Details Report';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: '312E81' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 30;

      worksheet.mergeCells('A2:I2');
      const dateCell = worksheet.getCell('A2');
      dateCell.value = `Request Date Range: ${startDateStr} to ${endDateStr}`;
      dateCell.font = { name: 'Arial', size: 10, italic: true };
      dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells('A3:I3');
      const genCell = worksheet.getCell('A3');
      genCell.value = `Generated Date: ${dayjs().format('DD/MM/YYYY HH:mm:ss')} WIB`;
      genCell.font = { name: 'Arial', size: 9, color: { argb: '4B5563' } };
      genCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.getRow(4).height = 15;

      const headerRow = worksheet.getRow(5);
      headerRow.height = 25;

      const columns = [
        { header: 'SPR No', key: 'spr_number', width: 22 },
        { header: 'Customer', key: 'customer_name', width: 25 },
        { header: 'Date', key: 'request_date', width: 18 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Part Name', key: 'part_name', width: 25 },
        { header: 'Part No', key: 'part_number', width: 20 },
        { header: 'Qty', key: 'qty', width: 15 },
        { header: 'Unit Price', key: 'unit_price', width: 18 },
        { header: 'Total Price', key: 'total_price', width: 18 }
      ];

      worksheet.columns = columns;

      columns.forEach((col, index) => {
        headerRow.getCell(index + 1).value = col.header;
      });

      for (let col = 1; col <= 9; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '312E81' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: '9CA3AF' } },
          bottom: { style: 'medium', color: { argb: '1E1B4B' } },
          left: { style: 'thin', color: { argb: '9CA3AF' } },
          right: { style: 'thin', color: { argb: '9CA3AF' } }
        };
      }

      for (const d of details) {
        const unitPrice = parseFloat(d.part?.price || 0);
        const totalPrice = (d.qty || 0) * unitPrice;

        const rowData = {
          spr_number: d.spr?.spr_number || '-',
          customer_name: d.spr?.forecast?.customer?.name || '-',
          request_date: d.spr?.request_date ? dayjs(d.spr.request_date).format('DD/MM/YYYY') : '-',
          status: d.spr?.status || 'Draft',
          part_name: d.part?.part_name || '-',
          part_number: d.part?.part_number || '-',
          qty: d.qty || 0,
          unit_price: unitPrice,
          total_price: totalPrice
        };

        const row = worksheet.addRow(rowData);
        row.height = 20;

        for (let col = 1; col <= 9; col++) {
          const cell = row.getCell(col);
          cell.font = { name: 'Arial', size: 9 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
            left: { style: 'thin', color: { argb: 'E5E7EB' } },
            right: { style: 'thin', color: { argb: 'E5E7EB' } }
          };

          if ([1, 3, 4, 6].includes(col)) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if ([2, 5].includes(col)) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }

          if (col === 7) {
            cell.numFmt = '#,##0';
          }
          if ([8, 9].includes(col)) {
            cell.numFmt = '#,##0.00';
          }
        }

        const statusCell = row.getCell(4);
        const status = d.spr?.status || 'Draft';
        let statusColors = { bg: 'F3F4F6', fg: '374151' }; // Draft
        if (status === 'Approved') {
          statusColors = { bg: 'D1FAE5', fg: '065F46' };
        } else if (status === 'Submitted') {
          statusColors = { bg: 'DBEAFE', fg: '1E40AF' };
        } else if (status === 'Rejected') {
          statusColors = { bg: 'FEE2E2', fg: '991B1B' };
        }

        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: statusColors.bg }
        };
        statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: statusColors.fg } };
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=SPR_Analytics_Report_${startDateStr}_${endDateStr}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('SPR Excel Export Error:', error);
      res.status(500).json({ status: false, error: error.message });
    }
  }

  async exportSpoDetails(req, res) {
    try {
      const { start_date, end_date } = req.query;

      const startDateStr = start_date
        ? dayjs(start_date).format('YYYY-MM-DD')
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date
        ? dayjs(end_date).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD');

      const details = await SSalesPurchaseOrderDetails.findAll({
        include: [
          {
            model: SSalesPurchaseOrders,
            as: 'order',
            where: {
              spo_date: {
                [Op.between]: [startDateStr, endDateStr]
              }
            },
            include: [
              { model: SCustomers, as: 'customer', attributes: ['name'] },
              { model: SSalesPurchaseRequests, as: 'spr', attributes: ['spr_number'] }
            ]
          },
          {
            model: SParts,
            as: 'part',
            attributes: ['part_name', 'part_number']
          }
        ],
        order: [[{ model: SSalesPurchaseOrders, as: 'order' }, 'spo_date', 'ASC'], ['spo_id', 'DESC']]
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('SPO Details');
      worksheet.views = [{ showGridLines: true }];

      // 1. Report Title Blocks
      worksheet.mergeCells('A1:J1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'Sales Purchase Order Details Report';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: '312E81' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 30;

      worksheet.mergeCells('A2:J2');
      const dateCell = worksheet.getCell('A2');
      dateCell.value = `SPO Date Range: ${startDateStr} to ${endDateStr}`;
      dateCell.font = { name: 'Arial', size: 10, italic: true };
      dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells('A3:J3');
      const genCell = worksheet.getCell('A3');
      genCell.value = `Generated Date: ${dayjs().format('DD/MM/YYYY HH:mm:ss')} WIB`;
      genCell.font = { name: 'Arial', size: 9, color: { argb: '4B5563' } };
      genCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.getRow(4).height = 15;

      const headerRow = worksheet.getRow(5);
      headerRow.height = 25;

      const columns = [
        { header: 'SPO No', key: 'spo_number', width: 22 },
        { header: 'SPR Ref', key: 'spr_ref', width: 22 },
        { header: 'Customer', key: 'customer_name', width: 25 },
        { header: 'PO Date', key: 'spo_date', width: 18 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Part Name', key: 'part_name', width: 25 },
        { header: 'Part No', key: 'part_number', width: 20 },
        { header: 'Ordered Qty', key: 'ordered_qty', width: 15 },
        { header: 'Sent Qty', key: 'sent_qty', width: 15 },
        { header: 'Outstanding Qty', key: 'outstanding_qty', width: 18 }
      ];

      worksheet.columns = columns;

      columns.forEach((col, index) => {
        headerRow.getCell(index + 1).value = col.header;
      });

      for (let col = 1; col <= 10; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '312E81' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: '9CA3AF' } },
          bottom: { style: 'medium', color: { argb: '1E1B4B' } },
          left: { style: 'thin', color: { argb: '9CA3AF' } },
          right: { style: 'thin', color: { argb: '9CA3AF' } }
        };
      }

      for (const d of details) {
        const ordered = d.ordered_qty || 0;
        const sent = d.sent_qty || 0;
        const outstanding = Math.max(0, ordered - sent);

        const rowData = {
          spo_number: d.order?.spo_number || '-',
          spr_ref: d.order?.spr?.spr_number || '-',
          customer_name: d.order?.customer?.name || '-',
          spo_date: d.order?.spo_date ? dayjs(d.order.spo_date).format('DD/MM/YYYY') : '-',
          status: d.order?.status || 'Draft',
          part_name: d.part?.part_name || '-',
          part_number: d.part?.part_number || '-',
          ordered_qty: ordered,
          sent_qty: sent,
          outstanding_qty: outstanding
        };

        const row = worksheet.addRow(rowData);
        row.height = 20;

        for (let col = 1; col <= 10; col++) {
          const cell = row.getCell(col);
          cell.font = { name: 'Arial', size: 9 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
            left: { style: 'thin', color: { argb: 'E5E7EB' } },
            right: { style: 'thin', color: { argb: 'E5E7EB' } }
          };

          if ([1, 2, 4, 5, 7].includes(col)) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if ([3, 6].includes(col)) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }

          if ([8, 9, 10].includes(col)) {
            cell.numFmt = '#,##0';
          }
        }

        const statusCell = row.getCell(5);
        const status = d.order?.status || 'Draft';
        let statusColors = { bg: 'F3F4F6', fg: '374151' }; // Draft
        if (status === 'Completed') {
          statusColors = { bg: 'D1FAE5', fg: '065F46' };
        } else if (status === 'Processing') {
          statusColors = { bg: 'DBEAFE', fg: '1E40AF' };
        } else if (status === 'Submitted' || status === 'Locked') {
          statusColors = { bg: 'FEF3C7', fg: '92400E' };
        } else if (status === 'Rejected') {
          statusColors = { bg: 'FEE2E2', fg: '991B1B' };
        }

        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: statusColors.bg }
        };
        statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: statusColors.fg } };
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=SPO_Analytics_Report_${startDateStr}_${endDateStr}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('SPO Excel Export Error:', error);
      res.status(500).json({ status: false, error: error.message });
    }
  }

  async exportSdpDetails(req, res) {
    try {
      const { start_date, end_date } = req.query;

      const startDateStr = start_date
        ? dayjs(start_date).format('YYYY-MM-DD')
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date
        ? dayjs(end_date).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD');

      const details = await SDeliveryPlanDetails.findAll({
        include: [
          {
            model: SDeliveryPlans,
            as: 'deliveryPlan',
            where: {
              scheduled_date: {
                [Op.between]: [startDateStr, endDateStr]
              }
            },
            include: [
              { model: SDocks, as: 'dock', attributes: ['name'] },
              {
                model: SDeliveryOrders,
                as: 'deliveryOrders',
                include: [{ model: SVehicles, as: 'vehicle', attributes: ['plate_number'] }]
              }
            ]
          },
          {
            model: SSalesPurchaseOrderDetails,
            as: 'spoDetail',
            include: [{ model: SParts, as: 'part', attributes: ['part_name'] }]
          }
        ],
        order: [[{ model: SDeliveryPlans, as: 'deliveryPlan' }, 'scheduled_date', 'ASC'], ['delivery_plan_id', 'DESC']]
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('SDP Details');
      worksheet.views = [{ showGridLines: true }];

      // 1. Report Title Blocks
      worksheet.mergeCells('A1:I1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'Sales Delivery Plan Details Report';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: '312E81' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 30;

      worksheet.mergeCells('A2:I2');
      const dateCell = worksheet.getCell('A2');
      dateCell.value = `Scheduled Date Range: ${startDateStr} to ${endDateStr}`;
      dateCell.font = { name: 'Arial', size: 10, italic: true };
      dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells('A3:I3');
      const genCell = worksheet.getCell('A3');
      genCell.value = `Generated Date: ${dayjs().format('DD/MM/YYYY HH:mm:ss')} WIB`;
      genCell.font = { name: 'Arial', size: 9, color: { argb: '4B5563' } };
      genCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.getRow(4).height = 15;

      const headerRow = worksheet.getRow(5);
      headerRow.height = 25;

      const columns = [
        { header: 'DP Number', key: 'dp_number', width: 22 },
        { header: 'Scheduled Date', key: 'scheduled_date', width: 18 },
        { header: 'Time Start', key: 'time_start', width: 15 },
        { header: 'Time End', key: 'time_end', width: 15 },
        { header: 'Dock Name', key: 'dock_name', width: 18 },
        { header: 'Vehicle Plate', key: 'vehicle_plate', width: 18 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Part Name', key: 'part_name', width: 25 },
        { header: 'Planned Qty', key: 'planned_qty', width: 15 }
      ];

      worksheet.columns = columns;

      columns.forEach((col, index) => {
        headerRow.getCell(index + 1).value = col.header;
      });

      for (let col = 1; col <= 9; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '312E81' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: '9CA3AF' } },
          bottom: { style: 'medium', color: { argb: '1E1B4B' } },
          left: { style: 'thin', color: { argb: '9CA3AF' } },
          right: { style: 'thin', color: { argb: '9CA3AF' } }
        };
      }

      for (const d of details) {
        const plates = d.deliveryPlan?.deliveryOrders
          ? d.deliveryPlan.deliveryOrders.map(o => o.vehicle?.plate_number).filter(Boolean).join(', ')
          : '';

        const rowData = {
          dp_number: d.deliveryPlan?.dp_number || '-',
          scheduled_date: d.deliveryPlan?.scheduled_date ? dayjs(d.deliveryPlan.scheduled_date).format('DD/MM/YYYY') : '-',
          time_start: d.deliveryPlan?.time_start || '-',
          time_end: d.deliveryPlan?.time_end || '-',
          dock_name: d.deliveryPlan?.dock?.name || '-',
          vehicle_plate: plates || '-',
          status: d.deliveryPlan?.status || 'Draft',
          part_name: d.spoDetail?.part?.part_name || '-',
          planned_qty: d.planned_qty || 0
        };

        const row = worksheet.addRow(rowData);
        row.height = 20;

        for (let col = 1; col <= 9; col++) {
          const cell = row.getCell(col);
          cell.font = { name: 'Arial', size: 9 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
            left: { style: 'thin', color: { argb: 'E5E7EB' } },
            right: { style: 'thin', color: { argb: 'E5E7EB' } }
          };

          if ([1, 2, 3, 4, 5, 6, 7].includes(col)) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if (col === 8) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }

          if (col === 9) {
            cell.numFmt = '#,##0';
          }
        }

        const statusCell = row.getCell(7);
        const status = d.deliveryPlan?.status || 'Draft';
        let statusColors = { bg: 'F3F4F6', fg: '374151' }; // Draft
        if (status === 'Scheduled') {
          statusColors = { bg: 'DBEAFE', fg: '1E40AF' };
        } else if (status === 'Loading') {
          statusColors = { bg: 'FEF3C7', fg: '92400E' };
        } else if (status === 'Dispatched') {
          statusColors = { bg: 'D1FAE5', fg: '065F46' };
        }

        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: statusColors.bg }
        };
        statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: statusColors.fg } };
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=SDP_Analytics_Report_${startDateStr}_${endDateStr}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('SDP Excel Export Error:', error);
      res.status(500).json({ status: false, error: error.message });
    }
  }

  async exportSdoDetails(req, res) {
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
      }

      // 4. Send Response Binary Stream
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=SDO_Shipment_Report_${startDateStr}_${endDateStr}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('SDO Excel Export Error:', error);
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
          attributes: ['forecast_qty']
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
          totalQty += d.forecast_qty || 0;
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
      const replacements = { startDate: startDateStr, endDate: endDateStr };

      const actuals = await db.sequelize.query(`
        SELECT 
          f.customer_id::int,
          d.part_id::int,
          d.period_date,
          SUM(d.forecast_qty)::int as fix_qty
        FROM s_sales_forecast_details d
        JOIN s_sales_forecasts f ON d.forecast_id = f.id
        WHERE d.qty_status = 'Fix' 
          AND f.status = 'Approved'
          AND d.period_date BETWEEN :startDate AND :endDate
        GROUP BY f.customer_id, d.part_id, d.period_date
      `, {
        replacements,
        type: QueryTypes.SELECT
      });

      const forecasts = await db.sequelize.query(`
        SELECT DISTINCT ON (f.customer_id, (snap->>'part_id')::integer, (snap->>'period_date')::date)
          f.customer_id::int,
          (snap->>'part_id')::integer as part_id,
          (snap->>'period_date')::date as period_date,
          (snap->>'forecast_qty')::integer as temporary_qty
        FROM s_sales_forecast_logs l
        JOIN s_sales_forecasts f ON l.forecast_id = f.id
        CROSS JOIN LATERAL json_array_elements(
          CASE 
            WHEN json_typeof(l.details_snapshot) = 'string' THEN (l.details_snapshot#>>'{}')::json 
            ELSE l.details_snapshot 
          END
        ) as snap
        WHERE l.details_snapshot IS NOT NULL
          AND f.status = 'Approved'
          AND (snap->>'qty_status') = 'Temporary'
          AND (snap->>'period_date')::date BETWEEN :startDate AND :endDate
        ORDER BY f.customer_id, (snap->>'part_id')::integer, (snap->>'period_date')::date, l.created_at DESC
      `, {
        replacements,
        type: QueryTypes.SELECT
      });

      const groups = {};
      for (const act of actuals) {
        const key = `${act.customer_id}:${act.part_id}:${act.period_date}`;
        if (!groups[key]) {
          groups[key] = {
            customer_id: act.customer_id,
            part_id: act.part_id,
            period_date: act.period_date,
            fixQty: 0,
            tempQty: 0
          };
        }
        groups[key].fixQty += act.fix_qty || 0;
      }

      for (const fc of forecasts) {
        const key = `${fc.customer_id}:${fc.part_id}:${fc.period_date}`;
        const pDateStr = dayjs(fc.period_date).format('YYYY-MM-DD');
        const grpKey = `${fc.customer_id}:${fc.part_id}:${pDateStr}`;
        if (!groups[grpKey]) {
          groups[grpKey] = {
            customer_id: fc.customer_id,
            part_id: fc.part_id,
            period_date: pDateStr,
            fixQty: 0,
            tempQty: 0
          };
        }
        groups[grpKey].tempQty += fc.temporary_qty || 0;
      }

      let totalAbsError = 0;
      let totalForecast = 0;

      for (const key in groups) {
        const g = groups[key];
        if (g.fixQty > 0 && g.tempQty > 0) {
          totalAbsError += Math.abs(g.fixQty - g.tempQty);
          totalForecast += g.tempQty;
        }
      }

      let accuracyRate = null;
      if (totalForecast > 0) {
        const rate = (1 - (totalAbsError / totalForecast)) * 100;
        accuracyRate = helper.round(Math.max(0, rate), 2);
      }

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

      let totalApprovalTimeSec = 0;
      let approvedCount = 0;

      for (const spr of approvedSprs) {
        const logs = [...spr.logs].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const approvedLog = logs.find(l => l.status === 'Approved');
        const submittedLog = logs.find(l => l.status === 'Submitted');

        if (approvedLog && approvedLog.created_at) {
          const end = dayjs(approvedLog.created_at);
          const start = submittedLog && submittedLog.created_at
            ? dayjs(submittedLog.created_at)
            : dayjs(spr.created_at);

          if (start && start.isValid() && end.isValid()) {
            const diffSec = end.diff(start, 'second');
            if (diffSec >= 0) {
              totalApprovalTimeSec += diffSec;
              approvedCount++;
            }
          }
        }
      }

      const avgApprovalTimeHours = approvedCount > 0
        ? helper.round((totalApprovalTimeSec / approvedCount) / 3600, 2)
        : null;

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
        { stage: 'Draft', count: funnelCreated },
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

  /**
   * GET /sales/analytics/spo
   * Returns SPO Analytics KPI cards, status breakdown, top customers, and monthly trends
   */
  async getSpoAnalytics(req) {
    try {
      const { start_date, end_date } = req.query;

      const startDateStr = start_date
        ? dayjs(start_date).format('YYYY-MM-DD')
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date
        ? dayjs(end_date).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD');

      // 1. Total Ordered Items & Fulfillment Rate (exclude Draft/Rejected)
      const totalOrderedResult = await SSalesPurchaseOrderDetails.findOne({
        include: [{
          model: SSalesPurchaseOrders,
          as: 'order',
          where: {
            spo_date: { [Op.between]: [startDateStr, endDateStr] },
            status: { [Op.notIn]: ['Draft', 'Rejected'] }
          },
          attributes: []
        }],
        attributes: [
          [db.sequelize.fn('SUM', db.sequelize.col('ordered_qty')), 'total_ordered'],
          [db.sequelize.fn('SUM', db.sequelize.col('sent_qty')), 'total_sent']
        ],
        raw: true
      });
      const totalOrdered = parseInt(totalOrderedResult?.total_ordered || 0, 10);
      const totalSent = parseInt(totalOrderedResult?.total_sent || 0, 10);
      const fulfillmentRate = totalOrdered > 0 ? helper.round((totalSent / totalOrdered) * 100, 2) : 0;

      // 2. Active Customers
      const activeCustomersResult = await SSalesPurchaseOrders.findAll({
        where: {
          spo_date: { [Op.between]: [startDateStr, endDateStr] }
        },
        attributes: [
          [db.sequelize.fn('DISTINCT', db.sequelize.col('customer_id')), 'customer_id']
        ],
        raw: true
      });
      const activeCustomers = activeCustomersResult.length;

      // 3. Status Breakdown
      const statusBreakdownRaw = await SSalesPurchaseOrders.findAll({
        where: {
          spo_date: { [Op.between]: [startDateStr, endDateStr] }
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
        Locked: 0,
        Processing: 0,
        Completed: 0,
        Rejected: 0
      };
      for (const item of statusBreakdownRaw) {
        if (statusBreakdown[item.status] !== undefined) {
          statusBreakdown[item.status] = parseInt(item.count, 10);
        }
      }

      // 4. Top Customers
      const topCustomersRaw = await SSalesPurchaseOrders.findAll({
        where: {
          spo_date: { [Op.between]: [startDateStr, endDateStr] }
        },
        include: [
          {
            model: SCustomers,
            as: 'customer',
            attributes: ['name']
          },
          {
            model: SSalesPurchaseOrderDetails,
            as: 'details',
            attributes: ['ordered_qty']
          }
        ]
      });

      const customerMap = {};
      for (const spo of topCustomersRaw) {
        const custName = spo.customer?.name || `Customer #${spo.customer_id}`;
        const custId = spo.customer_id;
        let qty = 0;
        if (spo.details) {
          for (const d of spo.details) {
            qty += d.ordered_qty || 0;
          }
        }
        if (!customerMap[custId]) {
          customerMap[custId] = { customer_id: custId, customer_name: custName, total_ordered_qty: 0 };
        }
        customerMap[custId].total_ordered_qty += qty;
      }

      const topCustomers = Object.values(customerMap)
        .sort((a, b) => b.total_ordered_qty - a.total_ordered_qty)
        .slice(0, 5);

      // 5. Monthly Order Trends
      const trendsMap = {};
      let currentMonth = dayjs(startDateStr).startOf('month');
      const endMonth = dayjs(endDateStr).startOf('month');
      while (currentMonth.isBefore(endMonth) || currentMonth.isSame(endMonth)) {
        const mStr = currentMonth.format('YYYY-MM');
        trendsMap[mStr] = {
          month: mStr,
          ordered_qty: 0,
          sent_qty: 0
        };
        currentMonth = currentMonth.add(1, 'month');
      }

      const sposForTrends = await SSalesPurchaseOrders.findAll({
        where: {
          spo_date: { [Op.between]: [startDateStr, endDateStr] }
        },
        include: [{
          model: SSalesPurchaseOrderDetails,
          as: 'details',
          attributes: ['ordered_qty', 'sent_qty']
        }]
      });

      for (const spo of sposForTrends) {
        const mStr = dayjs(spo.spo_date).format('YYYY-MM');
        if (trendsMap[mStr]) {
          if (spo.details) {
            for (const d of spo.details) {
              trendsMap[mStr].ordered_qty += d.ordered_qty || 0;
              trendsMap[mStr].sent_qty += d.sent_qty || 0;
            }
          }
        }
      }

      const monthlyTrends = Object.values(trendsMap).sort((a, b) => a.month.localeCompare(b.month));

      return {
        status: true,
        data: {
          date_range: {
            start: startDateStr,
            end: endDateStr
          },
          kpis: {
            total_ordered_items: totalOrdered,
            fulfillment_rate: fulfillmentRate,
            active_customers: activeCustomers
          },
          status_breakdown: statusBreakdown,
          top_customers: topCustomers,
          monthly_trends: monthlyTrends
        }
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  /**
   * GET /sales/analytics/sdo
   * Returns SDO Analytics KPIs, status counts, monthly forecast-vs-spo, and top customers
   */
  async getSdoAnalytics(req) {
    try {
      const { start_date, end_date } = req.query;

      const startDateStr = start_date
        ? dayjs(start_date).format('YYYY-MM-DD')
        : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDateStr = end_date
        ? dayjs(end_date).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD');

      // 1. Fetch SPOs for KPIs
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

      // 2. Fetch SDOs for status counts
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

      // 3. SLA Metrics
      const sdosDelivered = await SDeliveryOrders.findAll({
        where: {
          delivery_status: 'Delivered',
          shipment_date: { [Op.between]: [startDateStr, endDateStr] }
        },
        attributes: ['shipment_date', 'received_at']
      });

      let on_time = 0;
      let delayed = 0;
      for (const sdo of sdosDelivered) {
        if (!sdo.received_at) continue;
        const sla_deadline = dayjs(sdo.shipment_date).add(1, 'day');
        if (dayjs(sdo.received_at).isBefore(sla_deadline) || dayjs(sdo.received_at).isSame(sla_deadline)) {
          on_time++;
        } else {
          delayed++;
        }
      }
      const slaTotal = on_time + delayed;
      const on_time_rate = slaTotal > 0 ? helper.round(on_time / slaTotal, 4) : 0;

      // 4. Quantity Deficits (Sent vs Received Qty comparison grouped by part name)
      const sdoDetails = await SDeliveryOrderDetails.findAll({
        include: [
          {
            model: SDeliveryOrders,
            as: 'deliveryOrder',
            where: {
              shipment_date: {
                [Op.between]: [startDateStr, endDateStr]
              }
            },
            attributes: []
          },
          {
            model: SDeliveryPlanDetails,
            as: 'planDetail',
            include: [{
              model: SSalesPurchaseOrderDetails,
              as: 'spoDetail',
              include: [{
                model: SParts,
                as: 'part',
                attributes: ['part_name']
              }]
            }]
          }
        ]
      });

      const deficitsMap = {};
      for (const detail of sdoDetails) {
        const partName = detail.planDetail?.spoDetail?.part?.part_name || 'Unknown';
        const sent = detail.sent_qty || 0;
        const received = detail.received_qty || 0;

        if (!deficitsMap[partName]) {
          deficitsMap[partName] = {
            part_name: partName,
            total_sent: 0,
            total_received: 0
          };
        }
        deficitsMap[partName].total_sent += sent;
        deficitsMap[partName].total_received += received;
      }
      const quantity_deficits = Object.values(deficitsMap);

      // 5. Driver Performance Leaderboard
      const driverSdos = await SDeliveryOrders.findAll({
        where: {
          delivery_status: 'Delivered',
          shipment_date: {
            [Op.between]: [startDateStr, endDateStr]
          }
        },
        include: [{
          model: SUserDetail,
          as: 'driver',
          attributes: ['full_name']
        }]
      });

      const driverMap = {};
      for (const sdo of driverSdos) {
        const driverName = sdo.driver?.full_name || 'Unknown Driver';
        if (!driverMap[driverName]) {
          driverMap[driverName] = {
            driver_name: driverName,
            completed_sdos: 0
          };
        }
        driverMap[driverName].completed_sdos++;
      }
      const driver_performance = Object.values(driverMap)
        .sort((a, b) => b.completed_sdos - a.completed_sdos);

      return {
        status: true,
        data: {
          date_range: {
            start: startDateStr,
            end: endDateStr
          },
          kpis: {
            total_ordered_qty: totalOrderedQty,
            total_sent_qty: totalSentQty,
            on_time: on_time,
            delayed: delayed,
            on_time_rate: on_time_rate
          },
          sdo_status_counts: sdoCounts,
          quantity_deficits: quantity_deficits,
          driver_performance: driver_performance
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
