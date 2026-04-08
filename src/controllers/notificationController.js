import User from '../models/user.js';
import { Engineer } from '../models/engineersModal.js';

/**
 * Intelligent FCM token update system supporting multi-device management.
 * Adds new tokens or updates timestamps for existing ones.
 */
export const updateFcmToken = async (req, res) => {
  try {
    const { token, device } = req.body;
    const userId = req.user?.id || req.engineer?.id || req.body.userId; // Support different auth patterns
    const role = req.user?.role || (req.engineer ? 'engineer' : req.body.role);

    if (!userId || !token) {
      return res.status(400).json({ success: false, error: 'User ID and token are required' });
    }

    const Model = role === 'engineer' ? Engineer : User;

    // 1. Try to find if token already exists for this user
    const existing = await Model.findOne({
      _id: userId,
      'fcmTokens.token': token
    });

    if (existing) {
      // Update lastUsed timestamp
      await Model.updateOne(
        { _id: userId, 'fcmTokens.token': token },
        { $set: { 'fcmTokens.$.lastUsed': new Date() } }
      );
    } else {
      // Add as new token
      await Model.findByIdAndUpdate(userId, {
        $addToSet: {
          fcmTokens: {
            token,
            device: device || 'unknown',
            lastUsed: new Date()
          }
        }
      });
    }

    res.json({ success: true, message: 'FCM token synchronized successfully' });
  } catch (error) {
    console.error('[NotificationController] updateFcmToken error:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

/**
 * Removes a specific FCM token (usually on logout)
 */
export const removeFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user?.id || req.engineer?.id;
    const role = req.user?.role || (req.engineer ? 'engineer' : null);

    if (!token || !userId) {
      return res.status(400).json({ success: false, error: 'Token and Identity required' });
    }

    const Model = role === 'engineer' ? Engineer : User;

    await Model.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { token } }
    });

    res.json({ success: true, message: 'FCM token removed successfully' });
  } catch (error) {
    console.error('[NotificationController] removeFcmToken error:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
