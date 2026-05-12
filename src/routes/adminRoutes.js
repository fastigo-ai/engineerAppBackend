import express from 'express';
import AdminSubscription from '../models/AdminSubscription.js';
import * as notificationController from '../modules/notification/notification.controller.js';
import * as adminController from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/authMiddleWare.js';
import { adminLimiter } from '../middleware/rateLimiter.js';


const router = express.Router();

// Apply admin protection to all routes in this file
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));
router.use(adminLimiter);


/**
 * Register a new browser push subscription
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys, adminName } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ success: false, message: 'Invalid subscription data' });
    }

    await AdminSubscription.findOneAndUpdate(
      { endpoint },
      { endpoint, keys, adminName: adminName || 'Admin' },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, message: 'Subscription registered successfully' });
  } catch (error) {
    console.error('[AdminRoutes] Subscribe error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Manual Notification Endpoints
 */
router.post('/notification/send', notificationController.adminSendNotification);
router.post('/notification/campaign', notificationController.adminSendCampaign);
router.get('/notification/history', notificationController.adminGetHistory);

/**
 * Refund Tracking
 */
router.get('/refunds/pending', adminController.getPendingRefunds);

/**
 * Payout Management
 */
router.get('/payouts/pending', adminController.getPendingPayouts);
router.post('/payouts/approve/:id', adminController.approvePayout);
router.post('/payouts/reject/:id', adminController.rejectPayout);

/**
 * Dashboard Analytics
 */
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/users/search', adminController.searchUsers);

/**
 * Unregister a subscription
 */
router.delete('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    await AdminSubscription.deleteOne({ endpoint });
    res.status(200).json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
