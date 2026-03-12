import express from 'express'
import shiftCalendarModule from '../../module/master-data/shift_calendar.js'
import auth from '../../class/auth.class.js'

const router = express.Router()

router.get(
  '/dd-calendar-type',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftCalendarModule.getDdCalendarType(req, res)
  }
)

router.get(
  '/download',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftCalendarModule.download(req, res)
  }
)

router.get(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftCalendarModule.list(req, res)
  }
)

router.post(
  '/upload',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftCalendarModule.upload(req, res)
  }
)

router.post(
  '/',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftCalendarModule.add(req, res)
  }
)

router.put(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftCalendarModule.update(req, res)
  }
)

router.delete(
  '/:id',
  auth.sessionChecker,
  auth.permissionChecker(['Superadmin', 'Admin*']),
  async (req, res) => {
    await shiftCalendarModule.delete(req, res)
  }
)

export default router