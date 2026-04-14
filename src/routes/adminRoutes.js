import express from 'express';
import AdminSubscription from '../models/AdminSubscription.js';

const router = express.Router();

/**
 * Register a new browser push subscription
 * POST /api/admin/subscribe
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys, adminName } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ success: false, message: 'Invalid subscription data' });
    }

    // Update existing or create new
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
 * Unregister a subscription
 * DELETE /api/admin/unsubscribe
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
