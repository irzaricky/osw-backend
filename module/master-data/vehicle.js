import db from '../../models/index.js';
import { config } from '../../config/app.config.js';
import { Op } from 'sequelize';
import helper from '../../class/helper.class.js';
import BaseModule from '../../class/base.module.js';
import Joi from 'joi';
import uploadHelper from '../../class/upload.class.js';

const { SVehicles, RefVehicleType } = db;

class VehicleModule extends BaseModule {
    
    async list(req) {
        try {
            const params = req.query;
            const { limit, page, offset } = helper.getPagination(params);
            const search = params.search || '';
            const vehicle_type_id = params.vehicle_type_id;
            const active = params.active;

            const where = {};

            if (search) {
                where[Op.or] = [
                    { vehicle_code: { [Op.iLike]: `%${search}%` } },
                    { plate_number: { [Op.iLike]: `%${search}%` } }
                ];
            }

            if (vehicle_type_id) {
                where.vehicle_type_id = vehicle_type_id;
            }

            if (active !== undefined && active !== '') {
                where.status = active === 'true' || active === true;
            }

            const include = [
                {
                    model: RefVehicleType,
                    as: 'vehicle_type',
                    attributes: ['id', 'name', 'load_capacity']
                }
            ];

            const { count, rows } = await SVehicles.findAndCountAll({
                where,
                limit,
                offset,
                attributes: { exclude: ['vehicle_type_id', 'deleted_at'] },
                include,
                order: [['created_at', 'DESC']]
            });

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

            const schema = Joi.object({
                vehicle_code: Joi.string().max(20).required(),
                plate_number: Joi.string().max(20).required(),
                vehicle_type_id: Joi.number().integer().required(),
                image: Joi.string().allow(null, '').optional(),
            });

            const validation = helper.validate(data, schema);
            if (!validation.status) {
                await t.rollback();
                return validation;
            }


            const { vehicle_code, plate_number, vehicle_type_id } = validation.value;

            // Check if vehicle type exists
            const vehicleType = await RefVehicleType.findByPk(vehicle_type_id, { transaction: t });
            if (!vehicleType) {
                await t.rollback();
                return {
                    status: false,
                    error: 'Vehicle type not found',
                    code: 404
                };
            }

            // Check for existing vehicles (active or soft-deleted)
            const existingVehicles = await SVehicles.findAll({
                where: {
                    [Op.or]: [
                        { vehicle_code },
                        { plate_number }
                    ]
                },
                paranoid: false,
                transaction: t
            });

            const activeConflicts = existingVehicles.filter(v => !v.deleted_at);
            const deletedConflicts = existingVehicles.filter(v => v.deleted_at);

            if (activeConflicts.length > 0) {
                await t.rollback();
                const conflictCode = activeConflicts.find(v => v.vehicle_code === vehicle_code);
                const conflictPlate = activeConflicts.find(v => v.plate_number === plate_number);

                if (conflictCode) {
                    return { status: false, error: 'Vehicle code already exists', code: 409 };
                }
                if (conflictPlate) {
                    return { status: false, error: 'Plate number already exists', code: 409 };
                }
            }

            // If we found deleted records, we try to restore and update
            if (deletedConflicts.length > 0) {
                if (deletedConflicts.length > 1) {
                    await t.rollback();
                    return {
                        status: false,
                        error: 'Multiple deleted vehicles found with conflicting data. Cannot restore automatically.',
                        code: 409
                    };
                }

                const vehicleToRestore = deletedConflicts[0];

                // RESTORE LOGIC
                await vehicleToRestore.restore({ transaction: t });

                // Handle Image
                // user provides image -> Replace old one.
                // user provides NO image -> Delete old one (result is no image).
                let imagePath = null;
                if (req.files && req.files.image) {
                    // Upload new and delete old
                    const uploadResult = await uploadHelper.replaceImage(
                        req.files.image,
                        vehicleToRestore.image,
                        {
                            subDir: 'vehicles',
                            fileName: vehicle_code
                        }
                    );

                    if (!uploadResult.status) {
                        await t.rollback();
                        return {
                            status: false,
                            error: uploadResult.error,
                            code: 400
                        };
                    }
                    imagePath = uploadResult.data.path;
                } else {
                    if (vehicleToRestore.image) {
                        try { await uploadHelper.deleteImage(vehicleToRestore.image); } catch(e) {}
                    }
                    imagePath = null;
                }

                // Update fields
                vehicleToRestore.vehicle_code = vehicle_code;
                vehicleToRestore.plate_number = plate_number;
                vehicleToRestore.vehicle_type_id = vehicle_type_id;
                vehicleToRestore.image = imagePath;
                vehicleToRestore.status = true;

                await vehicleToRestore.save({ transaction: t });

                // Log activity
                await this.logActivity(req, {
                    moduleCode: 'master-data',
                    activityCode: 'CREATE',
                    resourceId: vehicleToRestore.id,
                    newData: vehicleToRestore,
                    description: `Restored and updated vehicle ${vehicleToRestore.vehicle_code} (${vehicleToRestore.plate_number})`,
                    transaction: t
                });

                await t.commit();

                return {
                    status: true,
                    data: vehicleToRestore,
                    message: 'Vehicle created successfully (Restored from history)'
                };
            }
            
            // Handle image upload
            let imagePath = null;
            if (req.files && req.files.image) {
                const uploadResult = await uploadHelper.uploadImage(req.files.image, {
                    subDir: 'vehicles',
                    fileName: vehicle_code
                });

                if (!uploadResult.status) {
                    await t.rollback();
                    return {
                        status: false,
                        error: uploadResult.error,
                        code: 400
                    };
                }

                imagePath = uploadResult.data.path;
            }

            const newVehicle = await SVehicles.create({
                vehicle_code,
                plate_number,
                vehicle_type_id,
                image: imagePath,
                status: true
            }, { transaction: t });

            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'CREATE',
                resourceId: newVehicle.id,
                newData: newVehicle,
                description: `Created new vehicle ${newVehicle.vehicle_code} (${newVehicle.plate_number})`,
                transaction: t
            });

            await t.commit();

            return {
                status: true,
                data: newVehicle,
                message: 'Vehicle created successfully'
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
            
            const schema = Joi.object({
                vehicle_code: Joi.string().max(20).optional(),
                plate_number: Joi.string().max(20).optional(),
                vehicle_type_id: Joi.number().integer().optional(),
                image: Joi.string().allow(null, '').optional(),
                status: Joi.boolean().optional()
            });

            const validation = helper.validate(data, schema);
            if (!validation.status) {
                await t.rollback();
                return validation;
            }

            const { vehicle_code, plate_number, vehicle_type_id, image, status } = validation.value;

            const vehicle = await SVehicles.findByPk(id, { transaction: t });

            if (!vehicle) {
                await t.rollback();
                return {
                    status: false,
                    error: 'Vehicle not found',
                    code: 404
                };
            }

            const oldData = JSON.parse(JSON.stringify(vehicle));

            // Check if vehicle code or plate number already exists (excluding current vehicle)
            if (vehicle_code || plate_number) {
                const existingVehicle = await SVehicles.findOne({
                    where: {
                        [Op.or]: [
                            vehicle_code ? { vehicle_code } : null,
                            plate_number ? { plate_number } : null
                        ].filter(Boolean),
                        id: { [Op.ne]: id }
                    },
                    transaction: t
                });

                if (existingVehicle) {
                    await t.rollback();
                    return {
                        status: false,
                        error: 'Vehicle code or plate number already exists',
                        code: 409
                    };
                }
            }

            if (vehicle_type_id) {
                const vehicleType = await RefVehicleType.findByPk(vehicle_type_id, { transaction: t });
                if (!vehicleType) {
                    await t.rollback();
                    return {
                        status: false,
                        error: 'Vehicle type not found',
                        code: 404
                    };
                }
            }

            // Handle image upload
            if (req.files && req.files.image) {
                const uploadResult = await uploadHelper.replaceImage(
                    req.files.image,
                    vehicle.image, // old image path
                    {
                        subDir: 'vehicles',
                        fileName: vehicle_code || vehicle.vehicle_code
                    }
                );

                if (!uploadResult.status) {
                    await t.rollback();
                    return {
                        status: false,
                        error: uploadResult.error,
                        code: 400
                    };
                }

                vehicle.image = uploadResult.data.path;
            }

            if (vehicle_code) vehicle.vehicle_code = vehicle_code;
            if (plate_number) vehicle.plate_number = plate_number;
            if (vehicle_type_id) vehicle.vehicle_type_id = vehicle_type_id;
            if (status !== undefined) vehicle.status = status;

            await vehicle.save({ transaction: t });

            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'UPDATE',
                resourceId: id,
                oldData,
                newData: vehicle,
                description: `Updated vehicle ${vehicle.vehicle_code} (${vehicle.plate_number})`,
                transaction: t
            });

            await t.commit();

            return {
                status: true,
                message: 'Vehicle updated successfully',
                data: vehicle
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
        const t = await db.sequelize.transaction();
        try {
            const id = req.params.id;
            const data = req.body;

            const schema = Joi.object({
                status: Joi.boolean().required()
            });

            const validation = helper.validate(data, schema);
            if (!validation.status) {
                await t.rollback();
                return validation;
            }

            const { status } = validation.value;

            const vehicle = await SVehicles.findByPk(id, { transaction: t });

            if (!vehicle) {
                await t.rollback();
                return {
                    status: false,
                    error: 'Vehicle not found',
                    code: 404
                };
            }

            const oldData = JSON.parse(JSON.stringify(vehicle));
            vehicle.status = status;
            await vehicle.save({ transaction: t });

            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'UPDATE_STATUS',
                resourceId: id,
                oldData,
                newData: vehicle,
                description: `Updated vehicle status ${vehicle.vehicle_code} (${vehicle.plate_number}) to ${status}`,
                transaction: t
            });

            await t.commit();

            return {
                status: true,
                message: 'Vehicle status updated successfully',
                data: vehicle
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
            const id = req.params.id;
            const vehicle = await SVehicles.findByPk(id, { transaction: t });

            if (!vehicle) {
                await t.rollback();
                return {
                    status: false,
                    error: 'Vehicle not found',
                    code: 404
                };
            }

            const oldData = JSON.parse(JSON.stringify(vehicle));

            // Delete associated image if exists
            if (vehicle.image) {
                uploadHelper.deleteImage(vehicle.image);
            }

            await vehicle.destroy({ transaction: t });

            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'DELETE',
                resourceId: id,
                oldData,
                description: `Deleted vehicle ${vehicle.vehicle_code} (${vehicle.plate_number})`,
                transaction: t
            });

            await t.commit();

            return {
                status: true,
                message: 'Vehicle deleted successfully'
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

    async addVehicleType(req) {
        const t = await db.sequelize.transaction();
        try {
            const data = req.body;

            const schema = Joi.object({
                name: Joi.string().max(50).required(),
                load_capacity: Joi.number().integer().required()
            });

            const validation = helper.validate(data, schema);
            if (!validation.status) {
                await t.rollback();
                return validation;
            }

            const { name, load_capacity } = validation.value;

            // Check if name already exists
            const existingType = await RefVehicleType.findOne({
                where: { name },
                transaction: t
            });

            if (existingType) {
                await t.rollback();
                return {
                    status: false,
                    error: 'Vehicle type name already exists',
                    code: 409
                };
            }

            const newType = await RefVehicleType.create({
                name,
                load_capacity
            }, { transaction: t });

            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'CREATE',
                resourceId: newType.id,
                newData: newType,
                description: `Created new vehicle type ${newType.name}`,
                transaction: t
            });

            await t.commit();

            return {
                status: true,
                data: newType,
                message: 'Vehicle type created successfully'
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

    async updateVehicleType(req) {
        const t = await db.sequelize.transaction();
        try {
            const id = req.params.id;
            const data = req.body;
            
            const schema = Joi.object({
                name: Joi.string().max(50).optional(),
                load_capacity: Joi.number().integer().optional()
            });

            const validation = helper.validate(data, schema);
            if (!validation.status) {
                await t.rollback();
                return validation;
            }

            const { name, load_capacity } = validation.value;

            const vehicleType = await RefVehicleType.findByPk(id, { transaction: t });

            if (!vehicleType) {
                await t.rollback();
                return {
                    status: false,
                    error: 'Vehicle type not found',
                    code: 404
                };
            }

            const oldData = JSON.parse(JSON.stringify(vehicleType));

            // Check if name already exists (excluding current type)
            if (name) {
                const existingType = await RefVehicleType.findOne({
                    where: {
                        name,
                        id: { [Op.ne]: id }
                    },
                    transaction: t
                });

                if (existingType) {
                    await t.rollback();
                    return {
                        status: false,
                        error: 'Vehicle type name already exists',
                        code: 409
                    };
                }
            }

            if (name) vehicleType.name = name;
            if (load_capacity !== undefined) vehicleType.load_capacity = load_capacity;

            await vehicleType.save({ transaction: t });

            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'UPDATE',
                resourceId: id,
                oldData,
                newData: vehicleType,
                description: `Updated vehicle type ${vehicleType.name}`,
                transaction: t
            });

            await t.commit();

            return {
                status: true,
                message: 'Vehicle type updated successfully',
                data: vehicleType
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

    async deleteVehicleType(req){
        const t = await db.sequelize.transaction();
        try {
            const id = req.params.id;

            const vehicleType = await RefVehicleType.findByPk(id, { transaction: t });
            if (!vehicleType) {
                await t.rollback();
                return {
                    status: false,
                    error: 'Vehicle type not found',
                    code: 404
                };
            }

            const oldData = JSON.parse(JSON.stringify(vehicleType));
            await vehicleType.destroy({ transaction: t });
            
            // Log activity
            await this.logActivity(req, {
                moduleCode: 'master-data',
                activityCode: 'DELETE',
                resourceId: id,
                oldData,
                description: `Deleted vehicle type ${vehicleType.name}`,
                transaction: t
            });
            await t.commit();
            return {
                status: true,
                message: 'Vehicle type deleted successfully'
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

    async getDropdownVehicleTypes(req) {
        try {
            const types = await RefVehicleType.findAll({
                attributes: ['id', 'name', 'load_capacity'],
                order: [['name', 'ASC']]
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
}

export default new VehicleModule();
