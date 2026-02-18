import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';

const { SAuditLogs, SUsers, SModules, RefActivities } = db;

class LogModule extends BaseModule {
    async list(req) {
        try {
            const { limit, page, offset } = helper.getPagination(req.query);
            const { user_id, module_id, activity_id, search } = req.query;

            const where = {};
            if (user_id) where.user_id = user_id;
            if (module_id) where.module_id = module_id;
            if (activity_id) where.activity_id = activity_id;

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
                    { model: SUsers, as: 'user', attributes: ['id', 'username'] },
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
}

export default new LogModule();
