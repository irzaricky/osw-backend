import express from 'express';
import factoryModule from '../../module/master-data/factory.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

router.get(
  '/dropdown',
  auth.sessionChecker,
  async (req, res) => {
    await factoryModule.getDropdown(req, res);
  }
);

router.get(
  '/download',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await factoryModule.download(req, res);
  }
);

router.post(
  '/upload',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await factoryModule.upload(req, res);
  }
);

router.get(
  '/',
  auth.sessionChecker,
  async (req, res) => {
    await factoryModule.list(req, res);
  }
);

router.post(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await factoryModule.add(req, res);
  }
);

router.put(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await factoryModule.update(req, res);
  }
);

router.delete(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await factoryModule.delete(req, res);
  }
);

export default router;