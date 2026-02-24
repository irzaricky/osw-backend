import express from 'express'
import partsModule from '../../module/master-data/parts.js'
import auth from '../../class/auth.class.js'
import helper from '../../class/helper.class.js'

const router = express.Router()

router.get(
  '/dropdown',
  auth.sessionChecker,
  async (req, res) => {
    const result = await partsModule.dropdown(req)
    helper.sendResponse(res, result)
  }
)

export default router