import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import axios from 'axios';
import dayjs from 'dayjs';

const { RefMasterCalendars, RefTypeCalendars } = db;

class CalendarModule extends BaseModule {
  async list(req) {
    try {
      const params = req.query;
      const { start_date, end_date } = params;

      const where = {};

      if (start_date && end_date) {
        where.date = {
          [Op.between]: [start_date, end_date]
        };
      } else if (start_date) {
        where.date = {
          [Op.gte]: start_date
        };
      } else if (end_date) {
        where.date = {
          [Op.lte]: end_date
        };
      }

      const include = [
        {
          model: RefTypeCalendars,
          as: 'type_calendar',
          attributes: ['id', 'code', 'name', 'is_holiday']
        }
      ];

      const rows = await RefMasterCalendars.findAll({
        where,
        attributes: { exclude: ['deleted_at', 'ref_type_calendar_id'] },
        include,
        order: [['date', 'ASC']]
      });

      return {
        status: true,
        data: rows
      };
    } catch (error) {
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async upsert(req) {
    const t = await db.sequelize.transaction();
    try {
      const data = req.body;

      const schema = Joi.object({
        date: Joi.date().iso().required(),
        ref_type_calendar_id: Joi.number().integer().required(),
        description: Joi.string().max(255).allow(null, '').optional()
      });

      const validation = helper.validate(data, schema);
      if (!validation.status) {
        await t.rollback();
        return validation;
      }

      const { date, ref_type_calendar_id, description } = validation.value;
      const formattedDate = helper.formatDate(date, 'YYYY-MM-DD');

      // Check if reference type exists
      const typeCalendar = await RefTypeCalendars.findByPk(ref_type_calendar_id, { transaction: t });
      if (!typeCalendar) {
        await t.rollback();
        return {
          status: false,
          message: 'Calendar type not found',
          code: 404
        };
      }

      // Check if record exists for this date
      const existingRecord = await RefMasterCalendars.findOne({
        where: { date: formattedDate },
        paranoid: false,
        transaction: t
      });

      if (existingRecord) {
        const oldData = JSON.parse(JSON.stringify(existingRecord));

        if (existingRecord.deleted_at) {
          await existingRecord.restore({ transaction: t });
        }

        existingRecord.ref_type_calendar_id = ref_type_calendar_id;
        existingRecord.description = description || null;
        
        await existingRecord.save({ transaction: t });

        // Log activity
        await this.logActivity(req, {
          moduleCode: 'master-data',
          activityCode: existingRecord.deleted_at ? 'CREATE' : 'UPDATE',
          resourceId: existingRecord.id,
          oldData: existingRecord.deleted_at ? null : oldData,
          newData: existingRecord,
          description: `Updated master calendar for date ${formattedDate}`,
          transaction: t
        });

        await t.commit();
        return {
          status: true,
          message: `Calendar event for ${formattedDate} updated successfully`,
          data: existingRecord
        };
      }

      // If absolutely no record exists, create new
      const newRecord = await RefMasterCalendars.create({
        date: formattedDate,
        ref_type_calendar_id,
        description: description || null
      }, { transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'CREATE',
        resourceId: newRecord.id,
        newData: newRecord,
        description: `Created custom master calendar for date ${formattedDate}`,
        transaction: t
      });

      await t.commit();
      return {
        status: true,
        message: 'Calendar event created successfully',
        data: newRecord
      };
    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async delete(req) {
    const t = await db.sequelize.transaction();
    try {
      const inputDate = req.params.date;

      // Convert format for strict matching
      const formattedDate = helper.formatDate(inputDate, 'YYYY-MM-DD');

      const record = await RefMasterCalendars.findOne({ 
        where: { date: formattedDate },
        transaction: t 
      });

      if (!record) {
        await t.rollback();
        return {
          status: false,
          message: 'Calendar event not found on this date',
          code: 404
        };
      }

      const oldData = JSON.parse(JSON.stringify(record));
      
      await record.destroy({ transaction: t });

      // Log activity
      await this.logActivity(req, {
        moduleCode: 'master-data',
        activityCode: 'DELETE',
        resourceId: record.id,
        oldData,
        description: `Deleted master calendar event for date ${formattedDate}`,
        transaction: t
      });

      await t.commit();

      return {
        status: true,
        message: 'Calendar event removed successfully'
      };
    } catch (error) {
      await t.rollback();
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async getCalendarTypes() {
    try {
      const types = await RefTypeCalendars.findAll({
        attributes: ['id', 'code', 'name', 'is_holiday'],
        order: [['id', 'ASC']]
      });

      return {
        status: true,
        data: types
      };
    } catch (error) {
      if (config.debug) {
        return {
          status: false,
          error: error.message,
          code: 500
        };
      }
      return {
        status: false,
        message: 'Internal server error',
        code: 500
      };
    }
  }

  async generateYear(req) {
    const t = await db.sequelize.transaction();
    try {
      const year = req.params.year;
      
      // Basic validation for year
      if (!year || isNaN(year) || year.length !== 4) {
        await t.rollback();
        return {
           status: false,
           message: 'Valid 4-digit year is required in the parameter',
           code: 400
        };
      }

      // Fetch reference mappings for WEEKEND and NATIONAL_HOLIDAY
      const typeWeekend = await RefTypeCalendars.findOne({ where: { code: 'WEEKEND' }});
      const typeHoliday = await RefTypeCalendars.findOne({ where: { code: 'NATIONAL_HOLIDAY' }});

      if (!typeWeekend || !typeHoliday) {
        await t.rollback();
        return {
          status: false,
          message: 'Calendar types WEEKEND or NATIONAL_HOLIDAY are missing from ref_type_calendars',
          code: 500
        };
      }

      const eventsToGenerate = [];
      const generatedDatesMem = new Set();

      // 1. Fetch National Holidays from API
      let holidays = [];
      try {
        const response = await axios.get(`https://libur.deno.dev/api?year=${year}`);
        holidays = response.data;
      } catch (err) {
        console.error('Failed to fetch from hari libur API:', err.message);
      }

      // Map API holidays
      if (Array.isArray(holidays)) {
        holidays.forEach(holiday => {
          const hDate = holiday.date;
          const hEvent = holiday.name  || 'Hari Libur Nasional';

          eventsToGenerate.push({
              date: hDate,
              ref_type_calendar_id: typeHoliday.id,
              description: hEvent
            });
            generatedDatesMem.add(hDate);
        });
      }

      // 2. Generate Weekends
      let currentDate = dayjs(`${year}-01-01`);
      const endDate = dayjs(`${year}-12-31`);

      while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
        // 0 is Sunday, 6 is Saturday
        const dayOfWeek = currentDate.day(); 
        const formattedDate = currentDate.format('YYYY-MM-DD');

        if (dayOfWeek === 0 || dayOfWeek === 6) {
          // Add as weekend only if it's not already a national holiday
          if (!generatedDatesMem.has(formattedDate)) {
             eventsToGenerate.push({
               date: formattedDate,
               ref_type_calendar_id: typeWeekend.id,
               description: dayOfWeek === 0 ? 'Hari Minggu' : 'Hari Sabtu'
             });
          }
        }
        
        currentDate = currentDate.add(1, 'day');
      }

      const startOfYear = `${year}-01-01`;
      const endOfYear = `${year}-12-31`;

      const existingRecords = await RefMasterCalendars.findAll({
        where: {
          date: {
             [Op.between]: [startOfYear, endOfYear]
          }
        },
        paranoid: false,
        attributes: ['id', 'date'],
        transaction: t
      });

      // Map existing DB data: date -> id
      const existingMapDict = {};
      existingRecords.forEach(record => {
         existingMapDict[record.date] = record.id;
      });

      // Map our new theoretical generation
      const bulkOps = eventsToGenerate.map(event => {
         const obj = {
            date: event.date,
            ref_type_calendar_id: event.ref_type_calendar_id,
            description: event.description,
            deleted_at: null
         };

         if (existingMapDict[event.date]) {
            obj.id = existingMapDict[event.date];
         }
         return obj;
      });

      // Perform Bulk Update/Insert
      if (bulkOps.length > 0) {
        await RefMasterCalendars.bulkCreate(bulkOps, {
           updateOnDuplicate: ['ref_type_calendar_id', 'description', 'deleted_at'],
           transaction: t
        });
      }

      await this.logActivity(req, {
         moduleCode: 'master-data',
         activityCode: 'CREATE',
         resourceId: null,
         newData: { year, processed_days: bulkOps.length },
         description: `Auto-Generated weekends and national holidays for year ${year}`,
         transaction: t
      });

      await t.commit();

      return {
         status: true,
         message: `Successfully generated ${bulkOps.length} calendar events (Weekends and Holidays) for ${year}`,
         data: {
           year,
           total_generated: bulkOps.length
         }
      };
    } catch (error) {
      await t.rollback();
      if (config.debug) {
         return {
            status: false,
            error: error.message,
            code: 500
         };
      }
      return {
         status: false,
         message: 'Internal server error while generating calendars',
         code: 500
      };
    }
  }
}

export default new CalendarModule();
