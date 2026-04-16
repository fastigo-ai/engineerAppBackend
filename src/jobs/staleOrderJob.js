import cron from 'node-cron';
import { Order } from '../models/orderSchema.js';
import { notifyBookingUpdate } from '../services/notification/notificationService.js';

/**
 * STALE ORDER MONITOR
 * Runs every minute to find orders that haven't been accepted within 15 minutes of creation.
 */
export const initStaleOrderJob = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // Find orders that are:
      // 1. Confirmed (paid)
      // 2. Not assigned yet
      // 3. Status is still Upcoming (not cancelled/accepted)
      // 4. Scheduled time HAS PASSED
      // 5. Notification hasn't been sent yet
      const staleOrders = await Order.find({
        status: 'paid',
        orderStatus: 'Upcoming',
        assignedEngineer: null,
        scheduledAt: { $lte: now },
        searchingDelayedNotificationSent: { $ne: true }
      });

      if (staleOrders.length > 0) {
        console.log(`[StaleOrderJob] Found ${staleOrders.length} stale unassigned orders.`);

        for (const order of staleOrders) {
          try {
            await notifyBookingUpdate(order.userId, order._id, 'SEARCHING_DELAYED', {
              serviceName: order.servicePlan?.name || 'your service'
            });

            // Mark as sent to avoid duplicate notifications
            order.searchingDelayedNotificationSent = true;
            await order.save();
            
            console.log(`[StaleOrderJob] Alert sent for Order ${order._id}`);
          } catch (err) {
            console.error(`[StaleOrderJob] Error notifying order ${order._id}:`, err);
          }
        }
      }
    } catch (error) {
      console.error('[StaleOrderJob] Execution error:', error);
    }
  });

  console.log('[StaleOrderJob] Monitor initialized (1-minute intervals)');
};
