import express from 'express';
import * as couponController from './coupon.controller.js';
import { authenticate, authorize } from '../../middleware/authMiddleWare.js';
import { couponLimiter } from '../../middleware/rateLimiter.js';


const router = express.Router();

// Apply auth middleware to all coupon routes
router.use(authenticate);

// Publicly available coupons for the logged-in user
router.get('/available', couponController.listAvailableCoupons);

// Validate and apply a coupon
router.post('/apply', couponLimiter, couponController.applyCoupon);

// Get the best coupon for the user
router.post('/best', couponLimiter, couponController.getBestCoupon);


// Reserve a coupon (usually handled internally, but available)
router.post('/reserve', couponController.reserveCoupon);

// --- Admin Routes ---
router.post('/admin/create', authorize('admin', 'super_admin'), couponController.adminCreateCoupon);
router.get('/admin/list', authorize('admin', 'super_admin'), couponController.adminListAllCoupons);
router.patch('/admin/toggle/:couponId', authorize('admin', 'super_admin'), couponController.adminToggleStatus);
router.delete('/admin/delete/:couponId', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { couponId } = req.params;
    await couponService.deleteCoupon(couponId);
    return res.status(200).json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to delete coupon' });
  }
});

export default router;
