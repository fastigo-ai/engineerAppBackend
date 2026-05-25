import express from 'express';
import { authenticate, authorize } from '../../../middleware/authMiddleWare.js';
import { 
  createCheckoutSession, 
  verifyPayment, 
  getOrderStatus, 
  getUserOrders, 
  handleRazorpayWebhook, 
  createCheckoutController, 
  updateOrderStatus, 
  initiateOrderPayment,
  getAllPayments
} from './payment.controller.js';
import { bookingLimiter } from '../../../middleware/rateLimiter.js';


const router = express.Router();

// Publicly accessible for Razorpay
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  handleRazorpayWebhook
);

// User protected routes
router.post('/checkout/session', authenticate, bookingLimiter, createCheckoutController);
router.post('/initiate-order-payment/:orderId', authenticate, bookingLimiter, initiateOrderPayment);
router.post('/verify', authenticate, verifyPayment);
router.patch('/update-status/:orderId', authenticate, updateOrderStatus);
router.get('/order/:orderId', authenticate, getOrderStatus);
router.get('/orders', authenticate, getUserOrders);

// Admin protected routes
router.get('/all', authenticate, authorize('admin', 'super_admin'), getAllPayments);

export default router;