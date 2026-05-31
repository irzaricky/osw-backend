import express from 'express'
import partsModule from '../../module/master-data/parts.js'
import auth from '../../class/auth.class.js'
import helper from '../../class/helper.class.js'

const router = express.Router()

router.get(
  '/dropdown',
  auth.sessionChecker,
  async (req, res) => {
    await partsModule.dropdown(req, res);
  }
);
router.get(
  '/dd-types',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await partsModule.ddPartTypes(req, res);
  }
);
router.get(
  '/dd-category',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await partsModule.ddPartCategories(req, res);
  }
);
router.get(
  '/dd-package',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await partsModule.ddPackages(req, res);
  }
);
router.get(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await partsModule.list(req, res);
  }
);
router.get(
  '/download',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await partsModule.download(req, res);
  }
);
router.post(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await partsModule.add(req, res);
  }
);
router.post(
  '/upload',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await partsModule.upload(req, res);
  }
)
router.put(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await partsModule.update(req, res);
  }
);
router.delete(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await partsModule.delete(req, res);
  }
);

export default router