import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import { Op } from 'sequelize';

const { SAuditLogs, SUsers, SModules, RefActivities } = db;
import xlsx from 'xlsx';

class LogModule extends BaseModule {
    getFilter(query) {
        const { user_id, module_id, activity_id, search, start_date, end_date } = query;
        const where = {};

        if (user_id) where.user_id = user_id;
        if (module_id) where.module_id = module_id;
        if (activity_id) where.activity_id = activity_id;

        if (start_date && end_date) {
            where.created_at = {
                [Op.between]: [
                    new Date(start_date + ' 00:00:00'),
                    new Date(end_date + ' 23:59:59')
                ]
            };
        } else if (start_date) {
            where.created_at = {
                [Op.gte]: new Date(start_date + ' 00:00:00')
            };
        } else if (end_date) {
            where.created_at = {
                [Op.lte]: new Date(end_date + ' 23:59:59')
            };
        }

        if (search) {
            where[Op.or] = [
                { description: { [Op.iLike]: `%${search}%` } },
                { resource_id: { [Op.iLike]: `%${search}%` } },
                { ip_address: { [Op.iLike]: `%${search}%` } },
                { '$user.email$': { [Op.iLike]: `%${search}%` } }
            ];
        }

        return where;
    }

    async download(req) {
        try {
            const where = this.getFilter(req.query);

            const logs = await SAuditLogs.findAll({
                where,
                include: [
                    { model: SUsers, as: 'user', attributes: ['id', 'email'] },
                    { model: SModules, as: 'module', attributes: ['id', 'name', 'code'] },
                    { model: RefActivities, as: 'activity', attributes: ['id', 'name', 'code'] }
                ],
                order: [['created_at', 'DESC']]
            });

            const data = logs.map(log => ({
                'Created At': helper.formatDate(log.created_at),
                'User': log.user ? log.user.email : 'System/Unknown',
                'Module': log.module ? log.module.name : 'Unknown',
                'Activity': log.activity ? log.activity.name : 'Unknown',
                'Resource ID': log.resource_id,
                'Old Data': log.old_data ? JSON.stringify(log.old_data) : '-',
                'New Data': log.new_data ? JSON.stringify(log.new_data) : '-',
                'Description': log.description,
                'IP Address': log.ip_address
            }));

            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(data);

            // Auto-width columns
            const colWidths = [
                { wch: 20 }, // Created At
                { wch: 30 }, // User
                { wch: 20 }, // Module
                { wch: 20 }, // Activity
                { wch: 10 }, // Resource ID
                { wch: 40 }, // Old Data
                { wch: 40 }, // New Data
                { wch: 50 }, // Description
                { wch: 15 }  // IP Address
            ];
            ws['!cols'] = colWidths;

            xlsx.utils.book_append_sheet(wb, ws, 'Logs');

            const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

            return {
                status: true,
                data: buffer,
                filename: `audit_logs_${helper.formatDate(new Date(), 'YYYYMMDD_HHmmss')}.xlsx`
            };
        } catch (error) {
            if (config.debug) {
                return { status: false, error: error.message, code: 500 };
            }
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    async list(req) {
        try {
            const { limit, page, offset } = helper.getPagination(req.query);
            const where = this.getFilter(req.query);

            const { count, rows } = await SAuditLogs.findAndCountAll({
                where,
                limit,
                offset,
                include: [
                    { model: SUsers, as: 'user', attributes: ['id', 'email'] },
                    { model: SModules, as: 'module', attributes: ['id', 'name', 'code'] },
                    { model: RefActivities, as: 'activity', attributes: ['id', 'name', 'code'] }
                ],
                order: [['created_at', 'DESC']]
            });

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

    async detail(req) {
        try {
            const { id } = req.params;
            const log = await SAuditLogs.findByPk(id, {
                include: [
                    { model: SUsers, as: 'user', attributes: ['id', 'email'] },
                    { model: SModules, as: 'module', attributes: ['id', 'name', 'code'] },
                    { model: RefActivities, as: 'activity', attributes: ['id', 'name', 'code'] }
                ]
            });

            if (!log) {
                return { status: false, error: 'Log not found', code: 404 };
            }

            return {
                status: true,
                data: log
            };
        } catch (error) {
            if (config.debug) {
                return { status: false, error: error.message, code: 500 };
            }
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    async getDropdownModules() {
        try {
            // Find distinct module_ids from logs
            const logModules = await SAuditLogs.findAll({
                attributes: ['module_id'],
                group: ['module_id'],
                where: {
                    module_id: { [Op.ne]: null }
                }
            });

            const moduleIds = logModules.map(l => l.module_id);

            const modules = await SModules.findAll({
                attributes: ['id', 'name'],
                where: {
                    id: moduleIds
                },
                order: [['name', 'ASC']]
            });

            return {
                status: true,
                data: modules
            };
        } catch (error) {
            if (config.debug) {
                return { status: false, error: error.message, code: 500 };
            }
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    async getDropdownActivity() {
        try {
            // Find distinct activity_ids from logs
            const logActivities = await SAuditLogs.findAll({
                attributes: ['activity_id'],
                group: ['activity_id'],
                where: {
                    activity_id: { [Op.ne]: null }
                }
            });

            const activityIds = logActivities.map(l => l.activity_id);

            const activities = await RefActivities.findAll({
                attributes: ['id', 'name'],
                where: {
                    id: activityIds
                },
                order: [['name', 'ASC']]
            });

            return {
                status: true,
                data: activities
            };
        } catch (error) {
            if (config.debug) {
                return { status: false, error: error.message, code: 500 };
            }
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }

    async getDropdownUsers() {
        try {
            // Find distinct user_ids from logs
            const logUsers = await SAuditLogs.findAll({
                attributes: ['user_id'],
                group: ['user_id'],
                where: {
                    user_id: { [Op.ne]: null }
                }
            });

            const userIds = logUsers.map(l => l.user_id);

            const users = await SUsers.findAll({
                attributes: ['id', 'email'],
                where: {
                    id: userIds
                },
                order: [['email', 'ASC']]
            });

            return {
                status: true,
                data: users
            };
        } catch (error) {
            if (config.debug) {
                return { status: false, error: error.message, code: 500 };
            }
            return { status: false, message: 'Internal server error', code: 500 };
        }
    }
}

export default new LogModule();
