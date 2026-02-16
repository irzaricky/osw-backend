
import helper from './helper.class.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/app.config.js';

class Auth {
    constructor() {
        // Bind methods to ensure 'this' context if needed
    }

    sessionChecker(req, res, next) {
        // Check for Bearer token
        if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
            const token = req.headers.authorization.split(' ')[1];
            try {
                const secretKey = config.debug ? "jwt_secret_cihuy" : global.__random;
                const decoded = jwt.verify(token, secretKey);
                
                // Initialize session if it doesn't exist (e.g. stateless request)
                if (!req.session) {
                    req.session = {};
                }
                
                req.session.user = {
                    id: decoded.id,
                    email: decoded.email,
                    role: decoded.role,
                    role_id: decoded.role_id
                };
                req.decoded = decoded; 
                
                return next();
            } catch (err) {
                return helper.sendResponse(res, {
                    status: false,
                    error: 'Invalid or expired token',
                    code: 401
                });
            }
        }

        if (req.session && req.session.user && req.cookies.user_sid) {
            return next();
        }
        
        return helper.sendResponse(res, {
            status: false,
            error: 'Unauthorized access',
            code: 401
        });
    }

    permissionChecker(roles) {
        return (req, res, next) => {
            if (!req.session || !req.session.user) {
                 return helper.sendResponse(res, {
                    status: false,
                    error: 'Unauthorized access',
                    code: 401
                });
            }

            const userRole = req.session.user.role; 
            
            if (Array.isArray(roles)) {
                 if (roles.includes(userRole)) {
                     return next();
                 }
            } else if (typeof roles === 'string') {
                if (userRole === roles) {
                    return next();
                }
            }

            return helper.sendResponse(res, {
                status: false,
                error: 'Forbidden access',
                code: 403
            });
        }
    }
}

export default new Auth();
