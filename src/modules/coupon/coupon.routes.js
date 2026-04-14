import express from 'express';
import * as couponController from './coupon.controller.js';
import { authenticate } from '../../middleware/authMiddleWare.js';

const router = express.Router();

// Apply auth middleware to all coupon routes
router.use(authenticate);

// Publicly available coupons for the logged-in user
router.get('/available', couponController.listAvailableCoupons);

// Validate and apply a coupon
router.post('/apply', couponController.applyCoupon);

// Reserve a coupon (usually handled internally, but available)
router.post('/reserve', couponController.reserveCoupon);

export default router;
