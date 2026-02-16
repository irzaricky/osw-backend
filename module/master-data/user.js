import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';

const { SUsers, SRoles, SUserDetail, SFactories, SLines } = db;

class UserModule extends BaseModule {
    
    /**
     * Apply division filter to a Sequelize include/where object based on current user's role.
     * @param {Object} query - The Sequelize find options object.
     * @param {Object} currentUser - The current user object from session.
     * @returns {Promise<Object>} The modified query object.
     */
    async applyDivisionFilter(query, currentUser) {
        if (!currentUser) return query;

        // Superadmin bypasses filtering
        if (currentUser.role === 'Superadmin') return query;

        // Admin roles filter by division
        if (currentUser.role && currentUser.role.startsWith('Admin')) {
            const userRole = await SRoles.findByPk(currentUser.role_id);
            if (userRole && userRole.division_id) {
                // Ensure there is an include for SRoles to apply the filter
                if (!query.include) query.include = [];

                let roleInclude = query.include.find(inc => inc.as === 'role' || (inc.model && (inc.model === SRoles || inc.model.name === 'SRoles')));
                
                if (roleInclude) {
                    roleInclude.where = { ...roleInclude.where, division_id: userRole.division_id };
                } else {
                    query.include.push({
                        model: SRoles,
                        as: 'role',
                        attributes: ['id', 'name', 'division_id'],
                        where: { division_id: userRole.division_id }
                    });
                }
            }
        }

        return query;
    }

    /**
     * Global RBAC check to see if current user can manage a specific target role.
     * @param {Object} currentUser - Current user from session.
     * @param {Number} targetRoleId - The role ID of the resource being managed.
     * @returns {Promise<Object>} Status object.
     */
    async checkRolePermission(currentUser, targetRoleId) {
        const userRoleName = typeof currentUser.role === 'object' ? currentUser.role.name : currentUser.role;

        if (userRoleName === 'Superadmin') {
            const targetRole = await SRoles.findByPk(targetRoleId);
            
            if (!targetRole) {
                return { status: false, error: 'Role not found', code: 404 };
            }

            if (targetRole.name === 'Superadmin') {
                return { status: false, error: 'Superadmin cannot manage other Superadmin', code: 403 };
            }
            return { status: true };
        }

        if (userRoleName && userRoleName.startsWith('Admin')) {
            const userRole = await SRoles.findByPk(currentUser.role_id);
            const targetRole = await SRoles.findByPk(targetRoleId);

            if (!userRole || !targetRole) {
                return { status: false, error: 'Invalid role configuration', code: 400 };
            }

            if (userRole.division_id !== targetRole.division_id) {
                return { status: false, error: 'Access denied: Target role belongs to another division', code: 403 };
            }

            return { status: true };
        }

        return { status: false, error: 'Permission denied', code: 403 };
    }

    async list(req) {
        try {
            const currentUser = req.session.user;
            const params = req.query;
            const { limit, page, offset } = helper.getPagination(params);
            const search = params.search || '';
            const role_id = params.role_id;
            const division_id = params.division_id;
            const factory_id = params.factory_id;
            const line_id = params.line_id;
            const active = params.active;

            const where = {};

            if (search) {
                where[Op.or] = [
                    { email: { [Op.iLike]: `%${search}%` } }
                ];
            }

            if (role_id) {
                where.role_id = role_id;
            }

            if (active !== undefined && active !== '') {
                where.active = active === 'true' || active === true;
            }

            // Build role include with optional division_id filter
            const roleIncludeWhere = {};
            if (division_id) {
                roleIncludeWhere.division_id = division_id;
            }

            // Build user_detail include with optional factory_id and line_id filters
            const userDetailWhere = {};
            if (factory_id) {
                if (factory_id == '0') {
                    userDetailWhere.factory_id = null;
                } else {
                    userDetailWhere.factory_id = factory_id;
                }
            }
            if (line_id) {
                if (line_id == '0') {
                    userDetailWhere.line_id = null;
                } else {
                    userDetailWhere.line_id = line_id;
                }
            }

            const include = [
                {
                    model: SRoles,
                    as: 'role',
                    attributes: ['id', 'name'],
                    ...(Object.keys(roleIncludeWhere).length > 0 && { where: roleIncludeWhere }),
                    include: [
                        {
                            model: db.RefDivisions,
                            as: 'division',
                            attributes: ['id', 'name']
                        }
                    ]
                },
                {
                    model: SUserDetail,
                    as: 'user_detail',
                    ...(Object.keys(userDetailWhere).length > 0 && { where: userDetailWhere }),
                    include: [
                        {
                            model: SFactories,
                            as: 'factory',
                            attributes: ['id', 'name']
                        },
                        {
                            model: SLines,
                            as: 'line',
                            attributes: ['id', 'name']
                        }
                    ]
                }
            ];

            let options = {
                where,
                limit,
                offset,
                attributes: { exclude: ['password'] },
                include,
                order: [['created_at', 'DESC']]
            };

            // Apply standardized division filtering
            options = await this.applyDivisionFilter(options, currentUser);

            const { count, rows } = await SUsers.findAndCountAll(options);

            return {
                status: true,
                data: helper.getPaginationData(rows, count, page, limit)
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

    async add(req) {
        const t = await db.sequelize.transaction();
        try {
            const data = req.body;
            const currentUser = req.session.user;

            const schema = Joi.object({
                email: Joi.string().email().required().messages({
                    'string.email': 'Email must be a valid email address',
                    'any.required': 'Email is required'
                }),
                password: Joi.string().min(6).required().messages({
                    'string.min': 'Password must be at least 6 characters long',
                    'any.required': 'Password is required'
                }),
                role_id: Joi.number().integer().required().messages({
                    'number.base': 'Role ID must be a number',
                    'any.required': 'Role ID is required'
                }),
                full_name: Joi.string().allow(null, '').optional(),
                phone_number: Joi.string().allow(null, '').optional(),
                factory_id: Joi.number().integer().allow(null).optional(),
                line_id: Joi.number().integer().allow(null).optional()
            });

            const validation = helper.validate(data, schema);
            if (!validation.status) {
                await t.rollback();
                return validation;
            }

            let { email, password, role_id, full_name, phone_number, factory_id, line_id } = validation.value;

            // If factory_id is null, line_id must be null
            if (!factory_id) {
                line_id = null;
            }

            // RBAC Check
            const permission = await this.checkRolePermission(currentUser, role_id);
            if (!permission.status) {
                await t.rollback();
                return permission;
            }

            const existingUser = await SUsers.findOne({
                where: { email },
                transaction: t
            });

            if (existingUser) {
                await t.rollback();
                return {
                    status: false,
                    error: 'Email already exists',
                    code: 409
                };
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = await SUsers.create({
                email,
                password: hashedPassword,
                role_id,
                active: true
            }, { transaction: t });

            // Generate employee number
            const lastEmployee = await SUserDetail.findOne({
                order: [['employee_number', 'DESC']],
                transaction: t
            });

            let nextEmpNo = 'EMP-001';
            if (lastEmployee && lastEmployee.employee_number) {
                const lastNoString = lastEmployee.employee_number.split('-')[1];
                const lastNo = parseInt(lastNoString) || 0;
                nextEmpNo = `EMP-${String(lastNo + 1).padStart(3, '0')}`;
            }

            await SUserDetail.create({
                user_id: newUser.id,
                employee_number: nextEmpNo,
                full_name: full_name || email.split('@')[0],
                phone_number: phone_number || null,
                factory_id: factory_id || null,
                line_id: line_id || null
            }, { transaction: t });

            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'CREATE',
                resourceId: newUser.id,
                newData: newUser,
                description: `Created new user ${newUser.email}`
            });

            await t.commit();

            return {
                status: true,
                data: newUser,
                message: 'User and detail created successfully'
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

    async update(req) {
        const t = await db.sequelize.transaction();
        try {
            const id = req.params.id;
            const data = req.body;
            const currentUser = req.session.user;
            
            const schema = Joi.object({
                email: Joi.string().email().optional(),
                password: Joi.string().min(6).optional().allow(null, ''),
                role_id: Joi.number().integer().optional(),
                full_name: Joi.string().allow(null, '').optional(),
                phone_number: Joi.string().allow(null, '').optional(),
                factory_id: Joi.number().integer().allow(null).optional(),
                line_id: Joi.number().integer().allow(null).optional()
            });

            const validation = helper.validate(data, schema);
            if (!validation.status) {
                await t.rollback();
                return validation;
            }

            let { role_id, email, password, full_name, phone_number, factory_id, line_id } = validation.value;

            // If factory_id is explicitly set to null, line_id must be null
            if (factory_id === null) {
                line_id = null;
            }

            const user = await SUsers.findByPk(id, { 
                include: [{ model: SUserDetail, as: 'user_detail' }],
                transaction: t 
            });

            if (!user) {
                await t.rollback();
                return {
                    status: false,
                    error: 'User not found',
                    code: 404
                };
            }

            const oldData = JSON.parse(JSON.stringify(user));

            // RBAC Check for existing user
            const currentTargetPermission = await this.checkRolePermission(currentUser, user.role_id);
            if (!currentTargetPermission.status) {
                await t.rollback();
                return currentTargetPermission;
            }

            // RBAC Check for new role if changing
            if (role_id && role_id !== user.role_id) {
                const newRolePermission = await this.checkRolePermission(currentUser, role_id);
                if (!newRolePermission.status) {
                    await t.rollback();
                    return newRolePermission;
                }
            }

            if (email) user.email = email;
            if (role_id) user.role_id = role_id;
            if (password) {
                user.password = await bcrypt.hash(password, 10);
            }

            await user.save({ transaction: t });

            // Update details
            const userDetail = await SUserDetail.findOne({ where: { user_id: id }, transaction: t });
            if (userDetail) {
                if (full_name !== undefined) userDetail.full_name = full_name;
                if (phone_number !== undefined) userDetail.phone_number = phone_number;
                if (factory_id !== undefined) userDetail.factory_id = factory_id;
                if (line_id !== undefined) userDetail.line_id = line_id;
                
                await userDetail.save({ transaction: t });
            }

            const updatedUser = await SUsers.findByPk(id, { 
                include: [{ model: SUserDetail, as: 'user_detail' }],
                transaction: t 
            });

            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'UPDATE',
                resourceId: id,
                oldData,
                newData: updatedUser,
                description: `Updated user ${user.email}`
            });

            await t.commit();

            return {
                status: true,
                message: 'User and detail updated successfully'
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

    async updateStatus(req) {
        try {
            const id = req.params.id;
            const { active } = req.body;
            const currentUser = req.session.user;

            if (active === undefined) {
                 return {
                    status: false,
                    error: 'Active status is required',
                    code: 400
                };
            }

            const user = await SUsers.findByPk(id);
            if (!user) {
                return {
                    status: false,
                    error: 'User not found',
                    code: 404
                };
            }

            const oldData = { active: user.active };

            // RBAC Check
            const permission = await this.checkRolePermission(currentUser, user.role_id);
            if (!permission.status) {
                return permission;
            }

            user.active = active;
            await user.save();

            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'UPDATE_STATUS',
                resourceId: id,
                oldData,
                newData: { active },
                description: `Updated status for user ${user.email} to ${active ? 'Active' : 'Inactive'}`
            });

             return {
                status: true,
                message: `User ${active ? 'activated' : 'deactivated'} successfully`
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

    async delete(req) {
        const t = await db.sequelize.transaction();
        try {
            const id = req.params.id;
            const currentUser = req.session.user;
            const user = await SUsers.findByPk(id, { transaction: t });

            if (!user) {
                await t.rollback();
                return {
                    status: false,
                    error: 'User not found',
                    code: 404
                };
            }

            const oldData = JSON.parse(JSON.stringify(user));

            // RBAC Check
            const permission = await this.checkRolePermission(currentUser, user.role_id);
            if (!permission.status) {
                await t.rollback();
                return permission;
            }

            await user.destroy({ transaction: t }); 

            // Deleting details
            const userDetail = await SUserDetail.findOne({ where: { user_id: id }, transaction: t });
            if (userDetail) {
                await userDetail.destroy({ transaction: t });
            }

            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'DELETE',
                resourceId: id,
                oldData,
                description: `Deleted user ${user.email}`
            });

            await t.commit();

            return {
                status: true,
                message: 'User and detail deleted successfully'
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

    async getDropdownRoles(req) {
        try {
            const currentUser = req.session.user;
            
            let roleOptions = {
                attributes: ['id', 'name'],
                where: { status: true },
                order: [['name', 'ASC']]
            };

            if (currentUser && currentUser.role !== 'Superadmin' && currentUser.role.startsWith('Admin')) {
                 const userRole = await SRoles.findByPk(currentUser.role_id);
                 if (userRole && userRole.division_id) {
                     roleOptions.where.division_id = userRole.division_id;
                 }
            }

            const roles = await SRoles.findAll(roleOptions);

            return {
                status: true,
                data: roles
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

    async getDropdownDivisions(req) {
         try {
            const currentUser = req.session.user;
            
            let divisionOptions = {
                attributes: ['id', 'name'],
                order: [['name', 'ASC']]
            };

             if (currentUser && currentUser.role !== 'Superadmin' && currentUser.role.startsWith('Admin')) {
                 const userRole = await SRoles.findByPk(currentUser.role_id);
                 if (userRole && userRole.division_id) {
                     divisionOptions.where = { id: userRole.division_id };
                 }
            }

            const divisions = await db.RefDivisions.findAll(divisionOptions);

            return {
                status: true,
                data: divisions
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

    async getDropdownStatus(req) {
        try {
            const status = [
                { id: true, label: 'Active' },
                { id: false, label: 'Inactive' }
            ];

            return {
                status: true,
                data: status
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

    async getDropdownFactories(req) {
        try {
            const factories = await SFactories.findAll({
                attributes: ['id', 'name'],
                order: [['name', 'ASC']]
            });

            return {
                status: true,
                data: factories
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

    async getDropdownLines(req) {
        try {
            const { factory_id } = req.query;
            let where = {};

            if (factory_id) {
                where.factory_id = factory_id;
            }

            const lines = await SLines.findAll({
                attributes: ['id', 'name', 'factory_id'],
                where,
                order: [['name', 'ASC']]
            });

            return {
                status: true,
                data: lines
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
}

export default new UserModule();
