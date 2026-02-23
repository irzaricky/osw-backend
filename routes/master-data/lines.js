import express from 'express';
import lineModule from '../../module/master-data/line.js';
import auth from '../../class/auth.class.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

router.get(
  '/dropdown',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await lineModule.getDropdown(req, res);
  }
);

router.get(
  '/download',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await lineModule.download(req, res);
  }
);

router.post(
  '/upload',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await lineModule.upload(req, res);
  }
);

router.get(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await lineModule.list(req, res);
  }
);

router.post(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await lineModule.add(req, res);
  }
);

router.put(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await lineModule.update(req, res);
  }
);

router.delete(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await lineModule.delete(req, res);
  }
);

export default router;