import express from 'express';
import stationBuffer from '../../module/warehouse/station-buffer.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const result = await stationBuffer.list(req);

  return res.status(result.code || 200).json(result);
});

router.post('/manual-in', async (req, res) => {
  const result = await stationBuffer.addManual(req);

  return res.status(result.code || 200).json(result);
});

router.post('/use', async (req, res) => {
  const result = await stationBuffer.useBuffer(req);

  return res.status(result.code || 200).json(result);
});

router.post('/scrap', async (req, res) => {
  const result = await stationBuffer.scrapBuffer(req);

  return res.status(result.code || 200).json(result);
});

router.get('/logs', async (req, res) => {
  const result = await stationBuffer.logs(req);

  return res.status(result.code || 200).json(result);
});

router.get('/summary', async (req, res) => {
  const result = await stationBuffer.summary(req);

  return res.status(result.code || 200).json(result);
});

router.get('/dropdown/parts', async (req, res) => {
  const result = await stationBuffer.partDropdown(req);

  return res.status(result.code || 200).json(result);
});
export default router;