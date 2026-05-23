import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import ExcelJS from 'exceljs';
import Joi from 'joi';
import dayjs from 'dayjs';

const {
  SSalesPurchaseRequests, SSalesPurchaseRequestDetails, SSalesPurchaseRequestLogs,
  SParts, SUsers, SUserDetail, SSalesForecasts
} = db;

class SPRModule extends BaseModule {
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

  async getDropdownStatuses(req) {
    return {
      status: true,
      data: ['Draft', 'Submitted', 'Approved', 'Rejected']
    };
  }

  async getDropdownSources(req) {
    return {
      status: true,
      data: ['Automatic', 'Manual']
    };
  }

  async list(req) {
    try {
      const params = req.query;
      const { start_date, end_date, status, source, search } = params;
      const { limit, page, offset } = helper.getPagination(params);

      const where = {};

      if (start_date && end_date) {
        where.request_date = { [Op.between]: [start_date, end_date] };
      }

      if (status) {
        where.status = status;
      }

      if (source) {
        where.source = source;
      }

      if (search) {
        where[Op.or] = [
          { spr_number: { [Op.like]: `%${search}%` } },
          { spr_name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ];
      }

      const include = [
        {
          model: SUsers,
          as: 'creator',
          attributes: ['id', 'email'],
          include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
        }
      ];

      const { count, rows } = await SSalesPurchaseRequests.findAndCountAll({
        where,
        include,
        limit,
        offset,
        order: [['created_at', 'DESC']]
      });

      return {
        status: true,
        data: helper.getPaginationData(rows, count, page, limit)
      };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async detail(req) {
    try {
      const { id } = req.params;

      const spr = await SSalesPurchaseRequests.findByPk(id, {
        include: [
          {
            model: SSalesPurchaseRequestDetails,
            as: 'details',
            include: [{ model: SParts, as: 'part', attributes: ['part_number', 'part_name'] }]
          },
          {
            model: SSalesPurchaseRequestLogs,
            as: 'logs',
            include: [
              {
                model: SUsers,
                as: 'user',
                attributes: ['id', 'email'],
                include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
              }
            ]
          },
          {
            model: SUsers,
            as: 'creator',
            attributes: ['id', 'email'],
            include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
          },
          {
            model: SUsers,
            as: 'sales_order_approver',
            attributes: ['id', 'email'],
            include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
          },
          {
            model: SUsers,
            as: 'ppic_approver',
            attributes: ['id', 'email'],
            include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
          },
          {
            model: SSalesForecasts,
            as: 'forecast',
            attributes: ['id', 'forecast_number']
          }
        ],
        order: [[{ model: SSalesPurchaseRequestLogs, as: 'logs' }, 'created_at', 'DESC']]
      });

      if (!spr) return { status: false, message: 'SPR not found', code: 404 };

      return { status: true, data: spr };
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async _generateSPRNumber(transaction) {
    const currentMonthStr = dayjs().format('YYYY-MM');
    const prefix = `SPR-${currentMonthStr}`;

    const lastSPR = await SSalesPurchaseRequests.findOne({
      where: { spr_number: { [Op.like]: `${prefix}-%` } },
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

    return `${prefix}-${seq.toString().padStart(4, '0')}`;
  }

  async _saveLogSnapshot(spr_id, status, action, remarks, changed_by, transaction) {
    const details = await SSalesPurchaseRequestDetails.findAll({
      where: { spr_id },
      include: [{ model: SParts, as: 'part', attributes: ['part_number', 'part_name'] }],
      transaction
    });

    const snapshot = details.map(d => ({
      part_number: d.part?.part_number,
      part_name: d.part?.part_name,
      qty: d.qty
    }));

    return await SSalesPurchaseRequestLogs.create({
      spr_id,
      status,
      action,
      remarks,
      changed_by,
      snapshot
    }, { transaction });
  }

  async createManual(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;
      const currentUser = req.user;

      const detailSchema = Joi.object({
        part_id: Joi.number().integer().required(),
        qty: Joi.number().integer().min(1).required()
      });

      const schema = Joi.object({
        spr_name: Joi.string().required(),
        required_date: Joi.date().iso().required(),
        description: Joi.string().allow(null, '').optional(),
        details: Joi.array().items(detailSchema).optional().default([])
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { spr_name, required_date, description, details } = validation.value;
      const spr_number = await this._generateSPRNumber(t);

      const spr = await SSalesPurchaseRequests.create({
        spr_number,
        spr_name,
        source: 'Manual',
        request_date: dayjs().format('YYYY-MM-DD'),
        required_date,
        description,
        status: 'Draft',
        created_by: currentUser.id
      }, { transaction: t });

      // Create details
      if (details && details.length > 0) {
        const detailRecords = details.map(d => ({
          spr_id: spr.id,
          part_id: d.part_id,
          qty: d.qty
        }));
        await SSalesPurchaseRequestDetails.bulkCreate(detailRecords, { transaction: t });
      }

      await this._saveLogSnapshot(spr.id, 'Draft', 'Created', 'Manual creation', currentUser.id, t);

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'CREATE_SPR',
        resourceId: spr.id,
        newData: spr,
        description: `Created SPR ${spr_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'SPR created successfully' };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async update(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const data = req.body;
      const currentUser = req.user;

      const spr = await SSalesPurchaseRequests.findByPk(id, { transaction: t });
      if (!spr) {
        await t.rollback();
        return { status: false, message: 'SPR not found', code: 404 };
      }

      if (!['Draft', 'Rejected'].includes(spr.status)) {
        await t.rollback();
        return { status: false, message: 'Only Draft or Rejected SPR can be updated', code: 400 };
      }

      const detailSchema = Joi.object({
        part_id: Joi.number().integer().required(),
        qty: Joi.number().integer().min(1).required()
      });

      const schema = Joi.object({
        spr_name: Joi.string().optional(),
        required_date: Joi.date().iso().optional(),
        description: Joi.string().allow(null, '').optional(),
        details: Joi.array().items(detailSchema).optional()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const updates = validation.value;
      const oldData = JSON.parse(JSON.stringify(spr));

      await spr.update(updates, { transaction: t });

      if (updates.details) {
        await SSalesPurchaseRequestDetails.destroy({ where: { spr_id: spr.id }, transaction: t });
        const detailRecords = updates.details.map(d => ({
          spr_id: spr.id,
          part_id: d.part_id,
          qty: d.qty
        }));
        await SSalesPurchaseRequestDetails.bulkCreate(detailRecords, { transaction: t });
      }

      await this._saveLogSnapshot(spr.id, spr.status, 'Updated', 'SPR updated by staff', currentUser.id, t);

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'UPDATE_SPR',
        resourceId: spr.id,
        oldData,
        newData: spr,
        description: `Updated SPR ${spr.spr_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'SPR updated successfully' };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async submit(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const currentUser = req.user;

      const spr = await SSalesPurchaseRequests.findByPk(id, { transaction: t });
      if (!spr) {
        await t.rollback();
        return { status: false, message: 'SPR not found', code: 404 };
      }

      if (!['Draft', 'Rejected'].includes(spr.status)) {
        await t.rollback();
        return { status: false, message: 'Only Draft or Rejected SPR can be submitted', code: 400 };
      }

      const oldData = JSON.parse(JSON.stringify(spr));
      await spr.update({ status: 'Submitted' }, { transaction: t });

      await this._saveLogSnapshot(spr.id, 'Submitted', 'Submitted', 'SPR submitted for review', currentUser.id, t);

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'SUBMIT_SPR',
        resourceId: spr.id,
        oldData,
        newData: spr,
        description: `Submitted SPR ${spr.spr_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'SPR submitted successfully' };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async reviewSalesOrder(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const { status, remarks } = req.body; // status: 'Approved' or 'Rejected'
      const currentUser = req.user;

      const spr = await SSalesPurchaseRequests.findByPk(id, { transaction: t });
      if (!spr) {
        await t.rollback();
        return { status: false, message: 'SPR not found', code: 404 };
      }

      if (spr.status !== 'Submitted') {
        await t.rollback();
        return { status: false, message: 'SPR is not in Submitted status', code: 400 };
      }

      const nextStatus = status === 'Approved' ? 'Approved' : 'Rejected';
      const action = status === 'Approved' ? 'Supervisor Approved' : 'Sales Order Rejected';

      await spr.update({
        status: nextStatus,
        approved_by: status === 'Approved' ? currentUser.id : null,
        remarks: remarks || null
      }, { transaction: t });

      await this._saveLogSnapshot(spr.id, nextStatus, action, remarks, currentUser.id, t);

      await t.commit();
      return { status: true, message: `SPR review completed: ${nextStatus}` };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async delete(req) {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;

      const spr = await SSalesPurchaseRequests.findByPk(id, { transaction: t });
      if (!spr) {
        await t.rollback();
        return { status: false, message: 'SPR not found', code: 404 };
      }

      if (spr.status !== 'Draft') {
        await t.rollback();
        return { status: false, message: 'Only Draft SPR can be deleted', code: 400 };
      }

      const oldData = JSON.parse(JSON.stringify(spr));

      await spr.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'sales',
        activityCode: 'DELETE_SPR',
        resourceId: id,
        oldData,
        description: `Deleted SPR ${spr.spr_number}`,
        transaction: t
      });

      await t.commit();
      return { status: true, message: 'SPR deleted successfully' };
    } catch (error) {
      await t.rollback();
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }



  async downloadTemplate(req, res) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('SPR Bulk Template');

      // Flat Table Headers
      const tableHeaderRow = [
        'SPR Name',
        'Required Date (YYYY-MM-DD)',
        'Description',
        'Part Number',
        'Qty'
      ];
      const headerRow = worksheet.addRow(tableHeaderRow);
      headerRow.font = { bold: true };

      // Styling columns
      worksheet.getColumn(1).width = 30; // SPR Name
      worksheet.getColumn(2).width = 25; // Required Date
      worksheet.getColumn(3).width = 30; // Description
      worksheet.getColumn(4).width = 25; // Part Number
      worksheet.getColumn(5).width = 15; // Qty

      // Example Row
      worksheet.addRow([
        'Example SPR 01',
        dayjs().add(7, 'day').format('YYYY-MM-DD'),
        'description',
        'PART-001',
        100
      ]);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=spr_bulk_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      return helper.sendResponse(res, { status: false, message: 'Failed to generate template', code: 500 });
    }
  }

  async uploadExcel(req) {
    try {
      if (!req.files || !req.files.file) {
        return { status: false, message: 'No file uploaded', code: 400 };
      }

      const file = req.files.file;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.data);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) return { status: false, message: 'Invalid Excel format', code: 400 };

      const errors = [];
      const sprGroups = {}; // key: spr_name

      // Parse all rows starting from row 2
      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        const sprName = row.getCell(1).text?.trim();
        const reqDateStr = row.getCell(2).text?.trim();
        const description = row.getCell(3).text?.trim();
        const partNumber = row.getCell(4).text?.trim();
        const qty = parseInt(row.getCell(5).value) || 0;

        if (!sprName && !reqDateStr && !partNumber && !qty) continue;

        if (!sprName) {
          errors.push(`Row ${i}: SPR Name is required`);
          continue;
        }
        if (!reqDateStr) {
          errors.push(`Row ${i}: Required Date is required`);
          continue;
        }
        const dateObj = dayjs(reqDateStr);
        if (!dateObj.isValid()) {
          errors.push(`Row ${i}: Invalid Required Date format. Use YYYY-MM-DD`);
          continue;
        }

        if (!partNumber) {
          errors.push(`Row ${i}: Part Number is required`);
          continue;
        }

        const part = await SParts.findOne({ where: { part_number: partNumber } });
        if (!part) {
          errors.push(`Row ${i}: Part Number '${partNumber}' not found`);
          continue;
        }

        if (qty <= 0) {
          errors.push(`Row ${i}: Qty must be greater than 0`);
          continue;
        }

        // Initialize group if new SPR Name
        if (!sprGroups[sprName]) {
          sprGroups[sprName] = {
            header: {
              spr_name: sprName,
              required_date: dateObj.format('YYYY-MM-DD'),
              description: description || ''
            },
            details: []
          };
        }

        // Add detail to group
        sprGroups[sprName].details.push({
          part_id: part.id,
          part_number: part.part_number,
          part_name: part.part_name,
          qty
        });
      }

      const resultData = Object.values(sprGroups);

      if (resultData.length === 0 && errors.length === 0) {
        errors.push('The Excel file is empty');
      }

      if (errors.length > 0) {
        return { status: false, message: 'Validation failed', data: errors, code: 400 };
      }

      // Save to database
      const t = await db.sequelize.transaction();
      try {
        const currentUser = req.user;
        const createdSPRs = [];

        for (const group of resultData) {
          const spr_number = await this._generateSPRNumber(t);
          
          const spr = await SSalesPurchaseRequests.create({
            spr_number,
            spr_name: group.header.spr_name,
            source: 'Manual',
            request_date: dayjs().format('YYYY-MM-DD'),
            required_date: group.header.required_date,
            description: group.header.description,
            status: 'Draft',
            created_by: currentUser.id
          }, { transaction: t });

          const detailRecords = group.details.map(d => ({
            spr_id: spr.id,
            part_id: d.part_id,
            qty: d.qty
          }));
          await SSalesPurchaseRequestDetails.bulkCreate(detailRecords, { transaction: t });

          await this._saveLogSnapshot(spr.id, 'Draft', 'Created', 'Bulk Excel creation', currentUser.id, t);

          await this.logActivity(req, {
            moduleCode: 'sales',
            activityCode: 'CREATE_SPR',
            resourceId: spr.id,
            newData: spr,
            description: `Created SPR ${spr_number} via Excel Upload`,
            transaction: t
          });

          createdSPRs.push(spr.spr_number);
        }

        await t.commit();
        return {
          status: true,
          message: `${createdSPRs.length} SPR(s) created successfully`,
          data: createdSPRs
        };
      } catch (error) {
        await t.rollback();
        throw error;
      }
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 };
      return { status: false, message: 'Internal server error', code: 500 };
    }
  }

  async exportExcel(req, res) {
    try {
      const { id } = req.params;
      const spr = await SSalesPurchaseRequests.findByPk(id, {
        include: [
          {
            model: SSalesPurchaseRequestDetails,
            as: 'details',
            include: [{ model: SParts, as: 'part', attributes: ['part_number', 'part_name'] }]
          }
        ]
      });

      if (!spr) return helper.sendResponse(res, { status: false, message: 'SPR not found', code: 404 });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('SPR Details');

      worksheet.addRow(['SPR Number', spr.spr_number]);
      worksheet.addRow(['SPR Name', spr.spr_name]);
      worksheet.addRow(['Status', spr.status]);
      worksheet.addRow([]);

      worksheet.addRow(['No', 'Part Number', 'Part Name', 'Qty']);
      spr.details.forEach((d, idx) => {
        worksheet.addRow([idx + 1, d.part?.part_number, d.part?.part_name, d.qty]);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=SPR_${spr.spr_number}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      if (config.debug) return helper.sendResponse(res, { status: false, error: error.message, code: 500 });
      return helper.sendResponse(res, { status: false, message: 'Internal server error', code: 500 });
    }
  }

  async exportLogExcel(req, res) {
    try {
      const { log_id } = req.params;
      const log = await SSalesPurchaseRequestLogs.findByPk(log_id, {
        include: [
          {
            model: SSalesPurchaseRequests,
            as: 'spr',
            include: [
              {
                model: SUsers,
                as: 'creator',
                attributes: ['email'],
                include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
              }
            ]
          },
          {
            model: SUsers,
            as: 'user',
            attributes: ['email'],
            include: [{ model: SUserDetail, as: 'user_detail', attributes: ['full_name'] }]
          }
        ]
      });

      if (!log) return helper.sendResponse(res, { status: false, message: 'Log not found', code: 404 });
      if (!log.snapshot) return helper.sendResponse(res, { status: false, message: 'Snapshot not found for this log', code: 404 });

      const spr = log.spr;
      const details = typeof log.snapshot === 'string' ? JSON.parse(log.snapshot) : log.snapshot;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('SPR Log Snapshot');

      // 1. Header Info
      worksheet.mergeCells('A1:B1');
      worksheet.getCell('A1').value = `SPR HISTORICAL SNAPSHOT (${log.action})`;
      worksheet.getCell('A1').font = { size: 14, bold: true };

      worksheet.addRow(['SPR Number', spr.spr_number]);
      worksheet.addRow(['SPR Name', spr.spr_name]);
      worksheet.addRow(['Action', log.action]);
      worksheet.addRow(['Status at Time', log.status]);
      worksheet.addRow(['Changed By', `${log.user?.user_detail?.full_name || log.user?.email}`]);
      worksheet.addRow(['Date', dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')]);
      if (log.remarks) worksheet.addRow(['Remarks', log.remarks]);
      worksheet.addRow([]); // Spacer

      // 2. Table Headers
      const tableHeaderRow = ['No', 'Part Number', 'Part Name', 'Qty'];
      const headerRow = worksheet.addRow(tableHeaderRow);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });

      // 3. Data Rows
      details.forEach((d, index) => {
        const rowData = [index + 1, d.part_number, d.part_name, d.qty];
        const row = worksheet.addRow(rowData);
        row.eachCell((cell) => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
      });

      // Adjust column widths
      worksheet.getColumn(1).width = 5;
      worksheet.getColumn(2).width = 25;
      worksheet.getColumn(3).width = 35;
      worksheet.getColumn(4).width = 15;

      const filename = `SPR_Log_${spr.spr_number}_${dayjs(log.createdAt).format('YYYYMMDD_HHmm')}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      if (config.debug) return helper.sendResponse(res, { status: false, error: error.message, code: 500 });
      return helper.sendResponse(res, { status: false, message: 'Internal server error', code: 500 });
    }
  }
}

export default new SPRModule();
