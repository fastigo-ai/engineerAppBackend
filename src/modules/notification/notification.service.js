import Notification from './Notification.model.js';
import { sendPushNotification } from './pushNotification.service.js';
import { sendInAppNotification } from './inAppNotification.service.js';
import { logger } from '../../utils/logger.js';

// Re-export sync for convenience (used by controllers)
export { syncDeviceToken } from './pushNotification.service.js';

/**
 * Enqueues a notification into the MongoDB queue
 */
export async function enqueueNotification({
  userId, userModel = 'User', type, title, body, data = {}, delayMs = 0,
}) {
  const nextRunAt = new Date(Date.now() + delayMs);
  return Notification.create({ userId, userModel, type, title, body, data, nextRunAt });
}

/**
 * Bulk enqueue for campaigns
 */
export async function enqueueBulk({ userIds, userModel = 'User', type, title, body, data = {} }) {
  const docs = userIds.map(userId => ({
    userId, userModel, type, title, body, data,
    status: 'PENDING',
    nextRunAt: new Date(),
  }));
  return Notification.insertMany(docs, { ordered: false });
}

/**
 * Central Dispatcher logic (Called by worker)
 * Decides whether to send Push, In-App, or both.
 */
export async function dispatchNotification(notification) {
  logger.info(`[Dispatcher] Dispatching notification ${notification._id} to user ${notification.userId}`);

  // 1. Always attempt In-App (Foreground/Socket) delivery
  const inAppResult = await sendInAppNotification(notification);

  // 2. Always attempt Push (Background/FCM) delivery
  // In a more complex system, we might check user settings here to see if Push is enabled.
  const pushResult = await sendPushNotification(notification);

  // Return a combined result for the worker to track
  // We prioritize Push result for the worker's status (RETRY logic usually follows FCM failure)
  return {
    success: pushResult.success || inAppResult.success,
    pushResult,
    inAppResult,
    fcmMessageId: pushResult.fcmMessageId,
    reason: pushResult.reason,
    skipped: pushResult.skipped
  };
}
