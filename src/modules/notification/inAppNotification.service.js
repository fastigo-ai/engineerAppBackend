import { getIO } from '../../config/socket.js';
import { logger } from '../../utils/logger.js';

/**
 * Sends an In-App notification via Socket.io
 */
export async function sendInAppNotification(notification) {
  try {
    const io = getIO();
    const { userId, title, body, type, data, _id } = notification;

    const payload = {
      notificationId: _id,
      title,
      body,
      type,
      metadata: data, // metadata (e.g., orderId) so the frontend can navigate
      timestamp: new Date()
    };

    logger.info(`[Socket] Sending In-App notification to user ${userId} (ID: ${_id})`);
    
    // Emit to specific userId room
    io.to(userId.toString()).emit('notification', payload);

    return { success: true, channel: 'SOCKET' };
  } catch (error) {
    logger.error(`[Socket] Failed to send In-App notification to ${notification.userId}:`, error.message);
    // We don't throw here to avoid crashing the dispatcher, but return failure
    return { success: false, reason: error.message };
  }
}
