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
  SDocks, SWarehouses, SCustomers, SVehicles, SUserDetail
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
        Draft: 0,
        Scheduled: 0,
        'In Transit': 0,
        Delivered: 0
      };

      for (const sdo of sdos) {
        const status = sdo.delivery_status || 'Draft';
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
            plan_count: 0
          };
        }
        dockUtilization[dockId].total_hours += hours;
        dockUtilization[dockId].plan_count += 1;
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
      titleCell.value = 'Laporan Pengiriman Sales Delivery Order';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: '312E81' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 30;

      worksheet.mergeCells('A2:J2');
      const dateCell = worksheet.getCell('A2');
      dateCell.value = `Rentang Filter Tanggal: ${startDateStr} s/d ${endDateStr}`;
      dateCell.font = { name: 'Arial', size: 10, italic: true };
      dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells('A3:J3');
      const genCell = worksheet.getCell('A3');
      genCell.value = `Tanggal Dibuat: ${dayjs().format('DD/MM/YYYY HH:mm:ss')} WIB`;
      genCell.font = { name: 'Arial', size: 9, color: { argb: '4B5563' } };
      genCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Empty row 4
      worksheet.getRow(4).height = 15;

      // 2. Data Grid Header Definitions
      const headerRow = worksheet.getRow(5);
      headerRow.height = 25;
      
      const columns = [
        { header: 'No. DO', key: 'do_number', width: 22 },
        { header: 'Tanggal Rencana', key: 'plan_date', width: 18 },
        { header: 'Tanggal Kirim', key: 'shipment_date', width: 18 },
        { header: 'Pelanggan', key: 'customer_name', width: 25 },
        { header: 'Armada (Plat)', key: 'vehicle_plate', width: 15 },
        { header: 'Pengemudi', key: 'driver_name', width: 22 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Qty Kirim', key: 'sent_qty', width: 15 },
        { header: 'Qty Diterima', key: 'received_qty', width: 15 },
        { header: 'Fulfillment Rate', key: 'fulfillment_rate', width: 18 }
      ];

      worksheet.columns = columns;

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
      res.setHeader('Content-Disposition', `attachment; filename=Laporan_Pengiriman_SDO_${startDateStr}_${endDateStr}.xlsx`);
      
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Excel Export Error:', error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
}

export default new AnalyticsModule();
