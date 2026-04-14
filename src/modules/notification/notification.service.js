import Notification from './Notification.model.js';
import DeviceToken from './DeviceToken.model.js';
import { admin } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';

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
 * Sends a notification using FCM (Called by worker)
 */
export async function dispatchNotification(notification) {
  const tokens = await DeviceToken.find({
    userId: notification.userId,
    userModel: notification.userModel,
    isActive: true,
  }).lean();

  if (tokens.length === 0) {
    logger.warn(`[FCM] No active tokens for ${notification.userModel} ${notification.userId}`);
    return { success: false, reason: 'NO_TOKENS' };
  }

  // FCM data payload only accepts strings
  const stringData = {
    notificationId: notification._id.toString(),
    type: notification.type,
    ...Object.fromEntries(
      Object.entries(notification.data || {})
        .map(([k, v]) => [k, String(v)])
    ),
  };

  const message = {
    tokens: tokens.map(t => t.fcmToken),
    notification: { title: notification.title, body: notification.body },
    data: stringData,
    android: {
      priority: 'high',
      notification: { sound: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    // Process per-token results for invalidation
    const invalidations = [];
    response.responses.forEach((result, i) => {
      if (!result.success) {
        const code = result.error?.code ?? '';
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          invalidations.push(
            DeviceToken.findOneAndUpdate(
              { fcmToken: tokens[i].fcmToken },
              { isActive: false, invalidatedAt: new Date() }
            )
          );
        }
        logger.warn(`[FCM] Service Error: ${code} | target: ${notification.userModel} ${notification.userId}`);
      }
    });

    if (invalidations.length > 0) {
      await Promise.allSettled(invalidations);
    }

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      fcmMessageId: response.responses.find(r => r.success)?.messageId ?? null,
    };
  } catch (error) {
    logger.error(`[FCM] Multicast fatal error for ${notification.userModel} ${notification.userId}:`, error);
    throw error;
  }
}
