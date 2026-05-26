import webpush from 'web-push';
import config from '../../../config/config.js';
import AdminSubscription from '../../admin/api/AdminSubscription.model.js';

// Configure VAPID keys
if (config.vapid && config.vapid.publicKey && config.vapid.privateKey) {
  webpush.setVapidDetails(
    'mailto:admin@door2fy.com',
    config.vapid.publicKey,
    config.vapid.privateKey
  );
  console.log('[WebPushService] VAPID keys configured successfully');
} else {
  console.warn('[WebPushService] VAPID keys missing in config. Web push features will be disabled.');
}

/**
 * Sends a notification to all registered admin browsers
 */
export const notifyAdmins = async (payload) => {
  try {
    const subscriptions = await AdminSubscription.find({});
    
    if (subscriptions.length === 0) {
      // console.log('[WebPushService] No admin subscriptions found to notify');
      return { success: true, count: 0 };
    }

    const notificationPayload = JSON.stringify(payload);

    const pushPromises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys
          },
          notificationPayload
        );
        return { success: true };
      } catch (error) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          // Token expired or invalid, remove it
          await AdminSubscription.deleteOne({ _id: sub._id });
          return { success: false, removed: true };
        }
        console.error(`[WebPushService] Error sending to subscription ${sub._id}:`, error.message);
        return { success: false, error: error.message };
      }
    });

    const results = await Promise.all(pushPromises);
    const successCount = results.filter(r => r.success).length;
    
    // console.log(`[WebPushService] Admin notification sent. Success: ${successCount}, Failures: ${results.length - successCount}`);
    
    return { success: true, sentCount: successCount };
  } catch (error) {
    console.error('[WebPushService] Fatal error in notifyAdmins:', error);
    return { success: false, error: error.message };
  }
};
