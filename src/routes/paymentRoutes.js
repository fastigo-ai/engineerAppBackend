import express from 'express';
import { authenticate } from '../middleware/authMiddleWare.js';
import { createCheckoutSession, verifyPayment, getOrderStatus, getUserOrders, handleRazorpayWebhook } from '../controllers/paymentController.js';

const router = express.Router();

// Payment routes (protected)
router.post('/checkout/session', authenticate, createCheckoutSession);
router.post('/verify', authenticate, verifyPayment);
router.get('/order/:orderId', authenticate, getOrderStatus);
router.get('/orders', authenticate, getUserOrders);

// Webhook route (no authentication - Razorpay calls this)
// IMPORTANT: Use express.raw() for webhook route to preserve raw body for signature verification
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  handleRazorpayWebhook
);

export default router;