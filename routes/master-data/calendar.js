import express from 'express';
import module from '../../module/master-data/calendar.js';
import helper from '../../class/helper.class.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const result = await module.list(req);
  return helper.sendResponse(res, result);
});

router.post('/', async (req, res) => {
  const result = await module.upsert(req);
  return helper.sendResponse(res, result);
});

router.delete('/:date', async (req, res) => {
  const result = await module.delete(req);
  return helper.sendResponse(res, result);
});

router.get('/dd-calendar-type', async (req, res) => {
  const result = await module.getCalendarTypes(req);
  return helper.sendResponse(res, result);
});

router.post('/generate/:year', async (req, res) => {
  const result = await module.generateYear(req);
  return helper.sendResponse(res, result);
});

export default router;
