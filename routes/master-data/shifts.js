import express from 'express'
import shiftModule from '../../module/master-data/shift.js'
import auth from '../../class/auth.class.js'

const router = express.Router()

router.get(
  '/dd-type',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftModule.getTypes(req, res)
  }
)

router.get(
  '/dd-category',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftModule.getCategories(req, res)
  }
)

router.get(
  '/dropdown',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftModule.getDropdown(req, res)
  }
)

router.get(
  '/download',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftModule.download(req, res)
  }
)

router.get(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftModule.list(req, res)
  }
)

router.post(
  '/upload',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftModule.upload(req, res)
  }
)

router.post(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftModule.add(req, res)
  }
)

router.put(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftModule.update(req, res)
  }
)

router.delete(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftModule.delete(req, res)
  }
)

export default router