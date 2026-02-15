import express from 'express';
import m$auth from '../module/auth.js';
import session from '../class/auth.class.js';
import helper from '../class/helper.class.js';

const router = express.Router();

router.post('/login', async (req, res) => {
    const result = await m$auth.login(req);
    helper.sendResponse(res, result);
});

router.post('/logout', async (req, res) => {
    const result = await m$auth.logout(req);
    res.clearCookie('user_sid');
    helper.sendResponse(res, result);
});

router.get('/me', session.sessionChecker, async (req, res) => {
    const result = await m$auth.me(req);
    helper.sendResponse(res, result);
});

export default router;
