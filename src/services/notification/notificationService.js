import { enqueueNotification, enqueueBulk } from '../../modules/notification/notification.service.js';

/**
 * PRODUCTION REFACTOR: Now sends all notifications via the MongoDB Queue
 */
export const sendPushNotification = async ({ targetId, targetModel, payload }) => {
  try {
    const data = payload.data || {};
    // Extract type from multiple possible locations to ensure integrity
    const type = payload.type || data.type || 'SYSTEM'; 

    await enqueueNotification({
      userId: targetId,
      userModel: targetModel || 'User',
      type: type,
      title: payload.notification?.title || payload.title || 'Notification',
      body: payload.notification?.body || payload.body || '',
      data: data
    });

    return { success: true, queued: true };
  } catch (error) {
    console.error(`[NotificationService] Enqueue error for ${targetModel} ${targetId}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Sends a notification to multiple targets via the queue.
 */
export const sendBatchPushNotification = async ({ targetIds, targetModel, payload }) => {
  try {
    const data = payload.data || {};
    const type = data.type || 'SYSTEM';

    await enqueueBulk({
      userIds: targetIds,
      userModel: targetModel || 'User',
      type: type,
      title: payload.notification?.title || 'Notification',
      body: payload.notification?.body || '',
      data: data
    });

    return { success: true, queued: true };
  } catch (error) {
    console.error(`[NotificationService] Bulk enqueue error:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Shorthand for User notifications
 */
export const sendPushToUser = (userId, payload) => {
  return sendPushNotification({ targetId: userId, targetModel: 'User', payload });
};

/**
 * Shorthand for Engineer notifications
 */
export const sendPushToEngineer = (engineerId, payload) => {
  return sendPushNotification({ targetId: engineerId, targetModel: 'Engineer', payload });
};

/**
 * Shorthand for Bulk Engineer notifications
 */
export const sendPushToMatchedEngineers = (engineerIds, payload) => {
  return sendBatchPushNotification({ targetIds: engineerIds, targetModel: 'Engineer', payload });
};
