import express from 'express';
import { sendOTP, verifyOTP, refreshAccessToken, logout, getMe } from './admin.controller.js';
import { authLimiter } from '../../../middleware/rateLimiter.js';
import { authenticate } from '../../../middleware/authMiddleWare.js';

const router = express.Router();

router.post('/send-otp', authLimiter, sendOTP);
router.post('/verify-otp', authLimiter, verifyOTP);
router.post('/refresh-token', refreshAccessToken);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);

export default router;
