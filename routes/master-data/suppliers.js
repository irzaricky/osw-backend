import express from 'express';
import suppliersModule from '../../module/master-data/suppliers.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

router.get(
  '/dropdown',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await suppliersModule.dropdown(req, res);
  }
);

router.get(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await suppliersModule.list(req, res);
  }
);

router.post(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await suppliersModule.add(req, res);
  }
);

router.put(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await suppliersModule.update(req, res);
  }
);

router.delete(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await suppliersModule.delete(req, res);
  }
);

export default router;