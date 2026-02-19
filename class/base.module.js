import db from '../models/index.js';

const { SRoles, SModules, RefActivities, SAuditLogs } = db;

class BaseModule {
    /**
     * Log a user activity to SAuditLogs.
     * @param {Object} req - The Express request object.
     * @param {Object} options - Log options { moduleCode, activityCode, resourceId, oldData, newData, description, transaction }
     */
    /**
     * Calculate difference between two objects.
     * @param {Object} oldData 
     * @param {Object} newData 
     * @returns {Object} { diffOld, diffNew }
     */
    getDiff(oldData, newData) {
        if (!oldData || !newData) return { diffOld: oldData, diffNew: newData };

        const oData = oldData.toJSON ? oldData.toJSON() : oldData;
        const nData = newData.toJSON ? newData.toJSON() : newData;

        const diffOld = {};
        const diffNew = {};

        const allKeys = new Set([...Object.keys(oData), ...Object.keys(nData)]);

        for (const key of allKeys) {
            // Skip timestamps
            if (['created_at', 'updated_at', 'deleted_at', 'createdAt', 'updatedAt', 'deletedAt'].includes(key)) continue;

            const oldVal = oData[key];
            const newVal = nData[key];

            // Compare values using JSON stringify to handle objects/dates cleanly
            // Treat undefined and null as loosely equal in some contexts, but strict diffing is safer for audit
            // We'll normalize undefined to null for comparison consistency if needed, but strict is fine.
            const sOld = JSON.stringify(oldVal) === undefined ? 'null' : JSON.stringify(oldVal);
            const sNew = JSON.stringify(newVal) === undefined ? 'null' : JSON.stringify(newVal);

            if (sOld !== sNew) {
                diffOld[key] = oldVal;
                diffNew[key] = newVal;
            }
        }

        return { diffOld, diffNew };
    }

    /**
     * Log a user activity to SAuditLogs.
     * @param {Object} req - The Express request object.
     * @param {Object} options - Log options { moduleCode, activityCode, resourceId, oldData, newData, description, transaction }
     */
    async logActivity(req, options) {
        try {
            const { moduleCode, activityCode, resourceId, oldData, newData, description, transaction } = options;
            const currentUser = req.user;

            let finalOldData = oldData;
            let finalNewData = newData;

            // Calculate diff if both exist (Update scenario)
            if (oldData && newData) {
                const { diffOld, diffNew } = this.getDiff(oldData, newData);
                finalOldData = diffOld;
                finalNewData = diffNew;
            }

            const [module, activity] = await Promise.all([
                moduleCode ? SModules.findOne({ 
                    where: { code: moduleCode },
                    ...(transaction && { transaction })
                }) : null,
                activityCode ? RefActivities.findOrCreate({ 
                    where: { code: activityCode },
                    defaults: { 
                        name: activityCode
                            .split('_')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ')
                    },
                    ...(transaction && { transaction })
                }).then(([activity]) => activity) : null
            ]);

            await SAuditLogs.create({
                user_id: currentUser?.id || null,
                module_id: module?.id || null,
                activity_id: activity?.id || null,
                resource_id: resourceId ? String(resourceId) : null,
                old_data: finalOldData || null,
                new_data: finalNewData || null,
                ip_address: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                user_agent: req.headers['user-agent'],
                description: description || null
            }, transaction ? { transaction } : {});
        } catch (error) {
            console.error('Audit Log Error:', error);
            // We don't throw here to avoid breaking the main flow if logging fails
        }
    }
}

export default BaseModule;
