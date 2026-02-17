import express from 'express';
import vehicleModule from '../../module/master-data/vehicle.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

// get dropdown vehicle types
router.get('/dd-vehicle-types', auth.sessionChecker, async (req, res) => {
    const result = await vehicleModule.getDropdownVehicleTypes(req);
    helper.sendResponse(res, result);
});

// post add vehicle type
router.post('/types', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await vehicleModule.addVehicleType(req);
    helper.sendResponse(res, result);
});

// put update vehicle type
router.put('/types/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await vehicleModule.updateVehicleType(req);
    helper.sendResponse(res, result);
});

// delete vehicle type
router.delete('/types/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await vehicleModule.deleteVehicleType(req);
    helper.sendResponse(res, result);
});

// get list vehicles
router.get('/', auth.sessionChecker, async (req, res) => {
    const result = await vehicleModule.list(req);
    helper.sendResponse(res, result);
});

// post add vehicle
router.post('/', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await vehicleModule.add(req);
    helper.sendResponse(res, result);
});

// put update vehicle
router.put('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await vehicleModule.update(req);
    helper.sendResponse(res, result);
});

// delete vehicle
router.delete('/:id', auth.sessionChecker, auth.permissionChecker(['Superadmin', 'Admin']), async (req, res) => {
    const result = await vehicleModule.delete(req);
    helper.sendResponse(res, result);
});

export default router;
