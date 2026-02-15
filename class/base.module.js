import db from '../models/index.js';

const { SRoles, SModules, RefActivities, SAuditLogs } = db;

class BaseModule {
    /**
     * Log a user activity to SAuditLogs.
     * @param {Object} req - The Express request object.
     * @param {Object} options - Log options { moduleCode, activityCode, resourceId, oldData, newData, description }
     */
    async logActivity(req, options) {
        try {
            const { moduleCode, activityCode, resourceId, oldData, newData, description } = options;
            const currentUser = req.session?.user;

            const [module, activity] = await Promise.all([
                moduleCode ? SModules.findOne({ where: { code: moduleCode } }) : null,
                activityCode ? RefActivities.findOrCreate({ 
                    where: { code: activityCode },
                    defaults: { 
                        name: activityCode
                            .split('_')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ')
                    }
                }).then(([activity]) => activity) : null
            ]);

            await SAuditLogs.create({
                user_id: currentUser?.id || null,
                module_id: module?.id || null,
                activity_id: activity?.id || null,
                resource_id: resourceId ? String(resourceId) : null,
                old_data: oldData || null,
                new_data: newData || null,
                ip_address: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                user_agent: req.headers['user-agent'],
                description: description || null
            });
        } catch (error) {
            console.error('Audit Log Error:', error);
            // We don't throw here to avoid breaking the main flow if logging fails
        }
    }
}

export default BaseModule;
