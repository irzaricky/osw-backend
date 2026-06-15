import express from 'express'
import auth from '../../class/auth.class.js'
import productionMaterialControlModule from '../../module/production-material-control/production-material-control.module.js'

const router = express.Router()

router.get('/production-results', auth.sessionChecker, async (req, res) => {
  const result = await productionMaterialControlModule.listProductionResult(req)
  return res.status(result.code || 200).json(result)
})

router.post('/production-results', auth.sessionChecker, async (req, res) => {
  const result = await productionMaterialControlModule.createProductionResult(req)
  return res.status(result.code || 200).json(result)
})

router.get('/scraps', auth.sessionChecker, async (req, res) => {
  const result = await productionMaterialControlModule.listScrap(req)
  return res.status(result.code || 200).json(result)
})

router.post('/scraps', auth.sessionChecker, async (req, res) => {
  const result = await productionMaterialControlModule.createScrap(req)
  return res.status(result.code || 200).json(result)
})

router.get('/replacements',
  auth.sessionChecker,
  async(req,res)=>{
    const result =
      await productionMaterialControlModule.listReplacement(req)

    return res
      .status(result.code || 200)
      .json(result)
})

router.post('/replacements',
  auth.sessionChecker,
  async(req,res)=>{
    const result =
      await productionMaterialControlModule.createReplacement(req)

    return res
      .status(result.code || 200)
      .json(result)
})

router.get('/dashboard', auth.sessionChecker, async (req, res) => {
  const result = await productionMaterialControlModule.dashboard(req)
  return res.status(result.code || 200).json(result)
})

router.get('/buffer-status', auth.sessionChecker, async (req, res) => {
  const result = await productionMaterialControlModule.listBufferStatus(req)
  return res.status(result.code || 200).json(result)
})

router.get('/dropdowns', auth.sessionChecker, async (req, res) => {
  const result = await productionMaterialControlModule.dropdowns(req)
  return res.status(result.code || 200).json(result)
})

router.get('/bom-materials/:product_part_id', auth.sessionChecker, async (req, res) => {
  const result = await productionMaterialControlModule.getBomMaterials(req)
  return res.status(result.code || 200).json(result)
})

router.get('/production-results/:production_result_id/replacements', auth.sessionChecker, async (req, res) => {
  const result = await productionMaterialControlModule.getReplacementByProductionResult(req)
  return res.status(result.code || 200).json(result)
})

export default router