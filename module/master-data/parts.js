import db from "../../models/index.js";
import { config } from "../../config/app.config.js";
import { Op } from "sequelize";
import helper from "../../class/helper.class.js";
import BaseModule from "../../class/base.module.js";
import ExcelJS from "exceljs";
import Joi from "joi";

const { SParts, RefPartTypes, SSuppliers, sequelize } = db

class PartsModule extends BaseModule {
  async dropdown(req) {
    try {
      const params = req.query || {}

      const search = (params.search || '').trim()
      const partTypeCode = (params.part_type_code || '').trim()

      const where = {}

      // filter part type
      if (partTypeCode) {
        where.part_type_code = partTypeCode
      }

      if (search) {
        where[Op.or] = [
          { part_number: { [Op.iLike]: `%${search}%` } },
          { part_name: { [Op.iLike]: `%${search}%` } }
        ]
      }

      const rows = await SParts.findAll({
        where,
        attributes: ['id', 'part_number', 'part_name', 'part_type_code'],
        order: [['part_number', 'ASC']]
      })

      return { status: true, data: rows }
    } catch (error) {
      if (config.debug) return { status: false, error: error.message, code: 500 }
      return { status: false, message: 'Internal server error', code: 500 }
    }
  }

  async ddPartTypes(req, res){
    let tmp = {};
    try {
      const partTypes = await RefPartTypes.findAll({
        where: { deleted_at: null },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
      });

    tmp = {
      status: true,
      code: 200,
      data: partTypes,
    };
    return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[PartsModule][ddPartTypes]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || "Internal Server Error",
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
      const part_types_code = params.part_types_code || null;
      const supplier_id = params.supplier_id || null;

      const where = { deleted_at: null };

      if (search) {
        where[Op.or] = [
          { part_number: { [Op.iLike]: `%${search}%` } },
          { part_name: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (part_types_code) {
        where.part_types_code = part_types_code;
      }

      if (supplier_id) {
        where.supplier_id = supplier_id;
      }

      const include = [
        {
          model: RefPartTypes,
          as: 'type',
          attributes: ['code', 'name'],
        },
        {
          model: SSuppliers,
          as: 'supplier',
          attributes: ['id', 'name'],
        },
      ];

      const { count, rows } = await SParts.findAndCountAll({
        where,
        limit,
        offset,
        attributes: { exclude: ["deleted_at"] },
        include,
        order: [["created_at", "DESC"]],
      });

      tmp = {
        status: true,
        code: 200,
        data: helper.getPaginationData(rows, count, page, limit),
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      console.log(`[PartsModule][list]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async add(req, res) {
    let tmp = {}
    const t = await sequelize.transaction();
    try {
      const schema = Joi.object({
        part_number: Joi.string().max(100).required(),
        part_name: Joi.string().max(100).required(),
        part_type_code: Joi.string().max(100).required(),
        supplier_id: Joi.number().integer().required(),
        price: Joi.number().integer().required(),
        safety_stock: Joi.number().integer().required,
        lead_time_days: Joi.number().integer().required(),
        model_name: Joi.string().max(100).required(),
        model_code: Joi.string().max(100).required(),
        generation: Joi.number().integer().required(),
        color: Joi.string().max(100).required(),
        color_code: Joi.number().integer().required(),
        uom: Joi.string().max(100).required(),
        package_name: Joi.string().max(100).required(),
        package_code: Joi.number().integer().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validation.status) {
        t.rollback();
        return helper.sendResponse(res, validation);
      }

      const { part_number, part_name, part_type_code, supplier_id, price, safety_stock, lead_time_days, model_name, model_code, generation, color, color_code, uom, package_name, package_code } = validation.value;

      const existing = await SParts.findOne({
        where: { part_number },
        paranoid: false,
        transaction: t,
      });

      if (existing && !exsting.deleted_at) {
        t.rollback();
        tmp = {
          status: false,
          code: 400,
          message: 'Part number already exists',
        };
        return helper.sendResponse(res, tmp);
      }

      const existingPartType = await RefPartTypes.findByPK(part_type_code, { transaction: t });
      if (!existingPartType) {
        t.rollback();
        tmp = {
          status: false,
          code: 400,
          message: 'Part type not found',
        };
        return helper.sendResponse(res, tmp);
      }

      let parts;

      if (existing && existinig.deleted_at) {
        const oldData = existinig.toJSON();
        await existing.restore({ transaction: t });

        existing.part_number = part_number ?? null;
        existing.part_name = part_name ?? null;
        existing.part_type_code = part_type_code ?? null;
        existing.supplier_id = supplier_id ?? null;
        existing.price = price ?? null;
        existing.safety_stock = safety_stock ?? null;
        existing.lead_time_days = lead_time_days ?? null;
        existing.model_name = model_name ?? null;
        existing.model_code = model_code ?? null;
        existing.generation = generation ?? null;
        existing.color = color ?? null;
        existing.color_code = color_code ?? null;
        existing.uom = uom ?? null;
        existing.package_name = package_name ?? null;
        existing.package_code = package_code ?? null;

        await existing.save({ transaction: t });

        parts = existing;
        await this.logActivity(req, {
          moduleCode: 'master-data',
          activityCode: 'RESTORE',
          resourceId: existing.id,
          oldData,
          newData: existing,
          description: `Restored part with name ${part_name}`,
          transaction: t,
        });
      } else {
        parts = await SParts.create(
          {
            part_number,
            part_name,
            part_type_code,
            supplier_id,
            price,
            safety_stock,
            lead_time_days,
            model_name,
            model_code,
            generation,
            color,
            color_code,
            uom,
            package_name,
            package_code,
          },
          { transaction: t }
        );
      }

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: parts.id,
        newData: parts,
        description: `Created part with name ${part_name}`,
        transaction: t,
      });

      await t.commit();

      tmp = {
        status: true,
        code: 201,
        message: 'Part created successfully',
        data: parts,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[PartsModule][add]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || 'Internal Server Error',
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
        part_number: Joi.stringg().max(100).required(),
        part_name: Joi.string().max(100).required(),
        part_type_code: Joi.string().max(100).required(),
        supplier_id: Joi.number().integer().required(),
        price: Joi.number().integer().required(),
        safety_stock: Joi.number().integer().required(),
        lead_time_days: Joi.number().integer().required(),
        model_name: Joi.string().max(100).required(),
        model_code: Joi.string().max(100).required(),
        generation: Joi.number().integer().required(),
        color: Joi.string().max(100).required(),
        color_code: Joi.number().integer().required(),
        uom: Joi.string().max(100).required(),
        package_name: Joi.string().max(100).required(),
        package_code: Joi.number().integer().required(),
      });

      const validation = helper.validate(req.body, schema);
      if (!validiation.status) {
        t.rollback();
        return helper.sendResponse(res, validation);
      }

      const {
        part_number,
        part_name,
        part_type_code,
        supplier_id,
        price,
        safety_stock,
        lead_time_days,
        model_name,
        model_code,
        generation,
        color,
        color_code,
        uom,
        package_name,
        package_code,
      } = validation.value;

      const parts = await SParts.findByPk(id, { transaction: t });
      if (!parts) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: 'Part not found',
        };
        return helper.sendResponse(res, tmp);
      }

      const existing = await SParts.findOne({
        where: {
          part_number,
          id: { [Op.ne]: id },
        },
        paranoid: false,
        transaction: t,
      });

      if (existing && !existing.deleted_at) {
        await t.rollback();
        tmp = {
          status: false,
          code: 400,
          message: 'Part number already exists',
        };
        return helper.sendResponse(res, tmp);
      }

      if (existing && existing.deleted_at) {
        await existing.destroy({ force: true, transaction: t });
      }

      const existingSupplier = await SSuppliers.findByPk(supplier_id, { transaction: t });
      if (!existingSupplier) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: 'Supplier not found',
        };
        return helper.sendResponse(res, tmp);
      }

      const oldData = parts.toJSON();

      await parts.update({
        part_number,
        part_name,
        part_type_code,
        supplier_id,
        price,
        safety_stock,
        lead_time_days,
        model_name,
        model_code,
        generation,
        color,
        color_code,
        uom,
        package_name,
        package_code,
      },
        { transaction: t }
      );

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'UPDATE',
        resourceId: parts.id,
        oldData,
        newData: parts,
        description: `Updated part with name ${part_name}`,
        transaction: t,
      });

      await t.commit();

      tmp = {
        status: true,
        code: 200,
        message: 'Part updated successfully',
        data: parts,
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[PartsModule][update]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || 'Internal Server Error',
      };
      return helper.sendResponse(res, tmp);
    }
  }

  async delete(req, res) {
    let tmp = {};
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const parts = await SParts.findByPk(id, { transaction: t });
      if (!parts) {
        await t.rollback();
        tmp = {
          status: false,
          code: 404,
          message: 'Part not found',
        };
        return helper.sendResponse(res, tmp);
      }

      const oldData = parts.toJSON();

      await parts.destroy({ transaction: t });

      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: parts.id,
        oldData,
        description: `Deleted part with name ${parts.part_name}`,
        transaction: t,
      });

      await t.commit();

      tmp = {
        status: true,
        code: 200,
        message: 'Part deleted successfully',
      };
      return helper.sendResponse(res, tmp);
    } catch (error) {
      await t.rollback();
      console.log(`[PartsModule][delete]:`, error);
      tmp = {
        status: false,
        code: error.code || 500,
        message: error.message || 'Internal Server Error',
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
          { part_number: { [Op.iLike]: `%${search}%` } },
          { part_name: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const parts = await SParts.findAll({
        where,
        include:
          [
            { model: SSuppliers, as: 'supplier', attributes: ['name'] },
            { model: RefPartTypes, as: 'type', attributes: ['name'] }
          ],
        order: [['created_at', 'DESC']],
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Parts');

      worksheet.columns = [
        { header: 'Part Number', key: 'part_number', width: 20 },
        { header: 'Part Name', key: 'part_name', width: 30 },
        { header: 'Part Type', key: 'part.type?.name', width: 30 },
        { header: 'Supplier', key: 'supplier.name', width: 30 },
        { header: 'Price', key: 'price', width: 30 },
        { header: 'Safety Stock', key: 'safety_stock', width: 30 },
        { header: 'Lead Time (Days)', key: 'lead_time_days', width: 30 },
        { header: 'Model Name', key: 'model_name', width: 30 },
        { header: 'Model Code', key: 'model_code', width: 30 },
        { header: 'Generation', key: 'generation', width: 30 },
        { header: 'Color', key: 'color', width: 30 },
        { header: 'Color Code', key: 'color_code', width: 30 },
        { header: 'UOM', key: 'uom', width: 30 },
      ];

      worksheet.getRow(1).font = { bold: true };

      parts.forEach((part) => {
        worksheet.addRow({
          part_number: part.part_number,
          part_name: part.part_name,
          part_type_code: part.part_type?.name,
          supplier: part.supplier?.name,
          price: part.price,
          safety_stock: part.safety_stock,
          lead_time_days: part.lead_time_days,
          model_name: part.model_name,
          model_code: part.model_code,
          generation: part.generation,
          color: part.color,
          color_code: part.color_code,
          uom: part.uom,
        });
      });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=parts_${new Date().toISOString()}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.log(`[PartsModule][download]:`, error);
      return helper.sendResponse(res, {
        status: false,
        code: 500,
        message: error.message || 'Internal Server Error',
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
          message: 'File is required',
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
          message: "Invalid Excel format",
        });
      }

      const EXPECTED_HEADERS = [
        'Part Number',
        'Part Name',
        'Part Type',
        'Supplier',
        'Price',
        'Safety Stock',
        'Lead Time (Days)',
        'Model Name',
        'Model Code',
        'Generation',
        'Color',
        'Color Code',
        'UOM',
      ];

      const headerRow = worksheet.getRow(1);
      const actualHeaders = EXPECTED_HEADERS.map((_, i) => headerRow.getCell(i + 1).value?.toString().trim() ?? "");
      const isValidTemplate = EXPECTED_HEADERS.every(
        (expected, i) => actualHeaders[i].toLowerCase() === expected.toLowerCase()
      );

      if (!isValidTemplate) {
        await t.rollback();
        return helper.sendResponse(res, {
          status: false,
          code: 400,
          message: `Invalid template. Expected headers: [${EXPECTED_HEADERS.join(", ")}], but got: [${actualHeaders.join(", ")}]`,
        });
      }

      let results = {
        created: 0,
        restored: 0,
        skipped: 0,
        errors: [],
      };

      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        const part_number = row.getCell(1).value?.toString().trim() ?? null;
        const part_name = row.getCell(2).value?.toString().trim() ?? null;
        const part_type = row.getCell(3).value?.toString().trim() ?? null;
        const supplier = row.getCell(4).value?.toString().trim() ?? null;
        const price = parseInt(row.getCell(5).value) || 0;
        const safety_stock = parseInt(row.getCell(6).value) || 0;
        const lead_time_days = row.getCell(7).value?.toString().trim() ?? null;
        const model_name = row.getCell(8).value?.toString().trim() ?? null;
        const model_code = row.getCell(9).value?.toString().trim() ?? null;
        const generation = row.getCell(10).value?.toString().trim() ?? null;
        const color = row.getCell(11).value?.toString().trim() ?? null;
        const color_code = row.getCell(12).value?.toString().trim() ?? null;
        const uom = row.getCell(13).value?.toString().trim() ?? null;

        if (!part_number) {
          results.errors.push({ row: i, message: "Part Number is required" });
          results.skipped++;
          continue;
        }

        if (!part_name) {
          results.errors.push({ row: i, message: "Part Name is required" });
          results.skipped++;
          continue;
        }

        if (!model_name) {
          results.errors.push({ row: i, message: "Model Name is required" });
          results.skipped++;
          continue;
        }

        if (!model_code) {
          results.errors.push({ row: i, message: "Model Code is required" });
          results.skipped++;
          continue;
        }

        if (!generation) {
          results.errors.push({ row: i, message: "Generation is required" });
          results.skipped++;
          continue;
        }

        const part_type_id = part_type_name
          ? await RefPartTypes.findOne({
            where: { name: part_type_name, deleted_at: null },
            transaction: t,
          })
          : null;

        if (!part_type_id) {
          results.errors.push({ row: i, message: `Part Type "${part_type}" not found` });
          results.skipped++;
          continue;
        }

        const suppliers = supplier_name
          ? await SSuppliers.findOne({
            where: { name: supplier, deleted_at: null },
            transaction: t,
          })
          : null;

        if (!suppliers) {
          results.errors.push({ row: i, message: `Supplier "${supplier}" not found` });
          results.skipped++;
          continue;
        }

        const existing = await SParts.findOne({
          where: { part_number, deleted_at: null },
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

          existing.part_number = part_number;
          existing.part_name = part_name;
          existing.part_type_id = part_type_id.id;
          existing.supplier_id = suppliers.id;
          existing.price = price;
          existing.safety_stock = safety_stock;
          existing.lead_time_days = lead_time_days;
          existing.model_name = model_name;
          existing.model_code = model_code;
          existing.generation = generation;
          existing.color = color;
          existing.color_code = color_code;
          existing.uom = uom;
          await existing.save({ transaction: t });

          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "RESTORE",
            resourceId: existing.id,
            oldData,
            newData: existing,
            description: `Restored part via upload (${part_number})`,
            transaction: t,
          });

          results.restored++;
        } else {
          const part = await SParts.create(
            { part_number, part_name, part_type_id: part_type_id.code, supplier_id: suppliers.id, price, safety_stock, lead_time_days, model_name, model_code, generation, color, color_code, uom },
            { transaction: t }
          );

          await this.logActivity(req, {
            moduleCode: "master-data",
            activityCode: "CREATE",
            resourceId: part.id,
            newData: part,
            description: `Created part via upload (${part_number})`,
            transaction: t,
          });

          results.created++;
        }
      };

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
      console.log(`[PartsModule][upload]:`, error);

      tmp = {
        status: false,
        code: 500,
        message: error.message || "Internal Server Error",
      };
      return helper.sendResponse(res, tmp);
    }
  }
}


export default new PartsModule()