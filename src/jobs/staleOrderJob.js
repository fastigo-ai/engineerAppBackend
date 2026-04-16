import cron from 'node-cron';
import { Order } from '../models/orderSchema.js';
import { notifyBookingUpdate, sendPushToEngineer } from '../services/notification/notificationService.js';

/**
 * STALE ORDER MONITOR
 * Runs every minute to handle:
 * 1. Searching timeout (unassigned orders)
 * 2. Engineer No-Show (assigned but not arriving)
 */
export const initStaleOrderJob = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // --- CASE 1: SEARCHING TIMEOUT (UNASSIGNED) ---
      const staleUnassigned = await Order.find({
        status: 'paid',
        orderStatus: 'Upcoming',
        assignedEngineer: null,
        scheduledAt: { $lte: now },
        searchingDelayedNotificationSent: { $ne: true }
      });

      for (const order of staleUnassigned) {
        try {
          await notifyBookingUpdate(order.userId, order._id, 'SEARCHING_DELAYED', {
            serviceName: order.servicePlan?.name || 'your service'
          });
          order.searchingDelayedNotificationSent = true;
          await order.save();
          console.log(`[StaleJob] Unassigned Alert sent for ${order._id}`);
        } catch (err) { console.error(`[StaleJob] Error notifying unassigned ${order._id}:`, err); }
      }

      // --- CASE 2: ENGINEER NO-SHOW (ASSIGNED BUT NOT ARRIVED) ---
      
      // PHASE 1: Ping Engineer at T+10 minutes
      const overduePing = await Order.find({
        orderStatus: 'Accepted',
        work_status: 'Upcoming', // Haven't started
        assignedEngineer: { $ne: null },
        scheduledAt: { $lte: new Date(now.getTime() - 10 * 60000) }, // 10 mins overdue
        noShowPhase: 0
      }).populate('assignedEngineer');

      for (const order of overduePing) {
        try {
          const eng = order.assignedEngineer;
          if (eng) {
            await sendPushToEngineer(eng._id, {
              title: 'Are you coming?',
              body: `Hi ${eng.name}, you have a scheduled job starting now. Please update your status or reach location immediately.`,
              data: { type: 'MATCHING', orderId: order._id.toString() }
            });
            // Also notify user that we are verifying
            await notifyBookingUpdate(order.userId, order._id, 'ENGINEER_NOSHOW_PING', { name: eng.name });
          }
          order.noShowPhase = 1;
          order.noShowPingedAt = now;
          await order.save();
          console.log(`[StaleJob] No-Show Ping sent for ${order._id}`);
        } catch (err) { console.error(`[StaleJob] Error pinging engineer for ${order._id}:`, err); }
      }

      // PHASE 2: Unassign at T+15 minutes (or 5 mins after ping)
      const overdueUnassign = await Order.find({
        orderStatus: 'Accepted',
        work_status: 'Upcoming',
        noShowPhase: 1,
        noShowPingedAt: { $lte: new Date(now.getTime() - 5 * 60000) } // 5 mins after ping
      });

      for (const order of overdueUnassign) {
        try {
          const oldEngineerId = order.assignedEngineer;
          
          // Unassign
          order.assignedEngineer = null;
          order.orderStatus = 'Upcoming'; // Set back to upcoming to trigger SEARCHING UI
          order.noShowPhase = 2; // Final state
          await order.save();

          // Notify User
          await notifyBookingUpdate(order.userId, order._id, 'USER_NOSHOW_ALERT');

          // Notify Engineer
          if (oldEngineerId) {
            await sendPushToEngineer(oldEngineerId, {
              title: 'Job Unassigned',
              body: 'You were unassigned from an order due to no-show/no-response.',
              data: { type: 'MATCHING', orderId: order._id.toString() }
            });
          }
          console.log(`[StaleJob] Unassigned No-Show order ${order._id}`);
        } catch (err) { console.error(`[StaleJob] Error unassigning no-show ${order._id}:`, err); }
      }

    } catch (error) {
      console.error('[StaleOrderJob] Execution error:', error);
    }
  });

  console.log('[StaleOrderJob] Monitor initialized (1-minute intervals)');
};
