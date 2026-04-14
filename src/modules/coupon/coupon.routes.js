import express from 'express';
import * as couponController from './coupon.controller.js';
import { authenticate, authorize } from '../../middleware/authMiddleWare.js';

const router = express.Router();

// Apply auth middleware to all coupon routes
router.use(authenticate);

// Publicly available coupons for the logged-in user
router.get('/available', couponController.listAvailableCoupons);

// Validate and apply a coupon
router.post('/apply', couponController.applyCoupon);

// Get the best coupon for the user
router.post('/best', couponController.getBestCoupon);

// Reserve a coupon (usually handled internally, but available)
router.post('/reserve', couponController.reserveCoupon);

// --- Admin Routes ---
router.post('/admin/create', authorize('admin'), couponController.adminCreateCoupon);
router.get('/admin/list', authorize('admin'), couponController.adminListAllCoupons);
router.patch('/admin/toggle/:couponId', authorize('admin'), couponController.adminToggleStatus);

export default router;
