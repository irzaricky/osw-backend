
import db from '../models/index.js';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/app.config.js';

const { SUsers, SRoles, SUserDetail } = db;

class AuthModule {
    async login(req) {
        const { username, password } = req.body;

        if (!username) {
            return {
                status: false,
                error: 'Username atau Email diperlukan',
                code: 400
            };
        }

        if (!password) {
            return {
                status: false,
                error: 'Password diperlukan',
                code: 400
            };
        }

        try {
            const user = await SUsers.findOne({
                where: {
                    [Op.or]: [
                        { username: username },
                        { email: username }
                    ]
                },
                include: [
                    {
                        model: SRoles,
                        as: 'role',
                        attributes: ['id', 'name']
                    },
                    {
                        model: SUserDetail,
                        as: 'user_detail',
                        attributes: ['id', 'full_name', 'employee_number']
                    }
                ]
            });

            if (!user) {
                return {
                    status: false,
                    error: 'User not found',
                    code: 404
                };
            }

            if (!user.active) {
                return {
                    status: false,
                    error: 'User is inactive',
                    code: 403
                };
            }

            const isPasswordValid = await bcrypt.compare(password, user.password);

            if (!isPasswordValid) {
                return {
                    status: false,
                    error: 'Invalid password',
                    code: 401
                };
            }

            // Generate Token
            const secretKey = config.debug ? "jwt_secret_cihuy" : global.__random;
            const token = jwt.sign(
                { 
                    id: user.id, 
                    username: user.username, 
                    role: user.role.name,
                    role_id: user.role.id
                },
                secretKey,
                { expiresIn: '12h' }
            );

            // Set session
            req.session.user = {
                id: user.id,
                username: user.username,
                email: user.email,
                role_id: user.role_id,
                role: user.role.name,
                token: token,
                user_detail: user.user_detail ? {
                    id: user.user_detail.id,
                    full_name: user.user_detail.full_name,
                    employee_number: user.user_detail.employee_number,
                } : null
            };

            return {
                status: true,
                message: 'Login successful',
                data: req.session.user
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

    async logout(req, res) { 
        const user = req.session.user;
        return new Promise((resolve) => {
            req.session.destroy((err) => {
                if(err){
                     resolve({
                        status: false,
                        error: 'Error logging out',
                        code: 500
                    });
                } else {
                    resolve({
                        status: true,
                        message: 'Logout successful',
                        data: user
                    });
                }
            });
        });
    }

    async me(req) {
        return {
            status: true,
            data: req.session.user
        };
    }
}

export default new AuthModule();
