import cron from 'node-cron';
import DeviceToken from './DeviceToken.model.js';
import { logger } from '../../utils/logger.js';

/**
 * TOKEN CLEANUP — runs daily at 3am
 * Deactivates tokens that haven't been seen in 90 days.
 */
export function startTokenCleanupCron() {
  cron.schedule('0 3 * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
      const result = await DeviceToken.updateMany(
        { lastSeenAt: { $lt: cutoff }, isActive: true },
        { isActive: false, invalidatedAt: new Date() }
      );
      if (result.modifiedCount > 0) {
        logger.info(`[TokenCleanup] Deactivated ${result.modifiedCount} stale tokens`);
      }
    } catch (error) {
      logger.error('[TokenCleanup] Cron failed:', error);
    }
  });
}

export function startAllNotificationCrons() {
  startTokenCleanupCron();
  logger.info('[NotificationCron] Stale token monitor active (Daily @ 3am)');
}
