import cron from 'node-cron';
import { Order } from '../models/orderSchema.js';
import VendorOrder from '../models/vendorOrderModal.js';
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
      }).populate('servicePlan servicePlans');

      for (const order of staleUnassigned) {
        try {
          await notifyBookingUpdate(order.userId, order._id, 'SEARCHING_DELAYED', {
            serviceName: order.servicePlan?.name || 'your service'
          });
          order.searchingDelayedNotificationSent = true;
          
          order.tracking.push({
            status: 'SEARCHING_DELAYED',
            title: 'Expert Not Found',
            subTitle: 'Still searching for an expert...',
            timestamp: new Date()
          });

          await order.save();
          console.log(`[StaleJob] Unassigned Alert sent for ${order._id}`);
        } catch (err) { console.error(`[StaleJob] Error notifying unassigned ${order._id}:`, err); }
      }

      // --- CASE 2: ENGINEER NOTIFICATIONS & NO-SHOW MANAGEMENT ---
      console.log(`[StaleJob] Scanning for overdue orders at ${now.toISOString()}...`);
      
      // PHASE 0: 5-minute Reminder (T-5 minutes)
      const upcomingReminders = await Order.find({
        orderStatus: 'Accepted',
        assignedEngineer: { $ne: null },
        scheduledAt: { 
          $gte: now, 
          $lte: new Date(now.getTime() + 6 * 60000) // Within next 6 minutes
        },
        reminder5mSent: { $ne: true }
      }).populate('assignedEngineer servicePlan');

      for (const order of upcomingReminders) {
        try {
          const eng = order.assignedEngineer;
          if (eng) {
            await sendPushToEngineer(eng._id, {
              title: 'Upcoming Order!',
              body: `Hi ${eng.name}, you have a scheduled order for ${order.servicePlan?.name || 'your service'} starting in 5 minutes. Please reach location on time.`,
              data: { type: 'MATCHING', orderId: order._id.toString() }
            });
            order.reminder5mSent = true;
            await order.save();
            console.log(`[StaleJob] 5m Reminder sent to engineer for ${order._id}`);
          }
        } catch (err) { console.error(`[StaleJob] Error sending 5m reminder for ${order._id}:`, err); }
      }

      // PHASE 1: Ping Engineer at T+10 minutes
      const overduePing = await Order.find({
        orderStatus: 'Accepted',
        work_status: { $in: ['Upcoming', 'Accepted'] }, // Haven't started yet
        assignedEngineer: { $ne: null },
        scheduledAt: { $lte: new Date(now.getTime() - 10 * 60000) }, // 10 mins overdue
        noShowPhase: { $in: [0, null] }
      }).populate('assignedEngineer');

      if (overduePing.length > 0) {
        console.log(`[StaleJob] Found ${overduePing.length} orders for Phase 1 Ping`);
      }

      for (const order of overduePing) {
        try {
          const eng = order.assignedEngineer;
          if (eng) {
            await sendPushToEngineer(eng._id, {
              title: 'Are you coming?',
              body: `Hi ${eng.name}, you have a scheduled order starting now. You are coming? Please start work or reach location immediately.`,
              data: { type: 'MATCHING', orderId: order._id.toString() }
            });
          }
          
          order.noShowPhase = 1;
          order.noShowPingedAt = now;
          await order.save();
          console.log(`[StaleJob] No-Show Phase 1 (Ping) for ${order._id}`);
        } catch (err) { console.error(`[StaleJob] Error updating phase 1 for ${order._id}:`, err); }
      }

      // PHASE 2: Auto-Cancel at T+15 minutes (or 5 mins after ping)
      const overdueCancel = await Order.find({
        noShowPhase: 1,
        noShowPingedAt: { $lte: new Date(now.getTime() - 5 * 60000) }, // 15 mins total or 5 mins after ping
        orderStatus: 'Accepted',
        work_status: { $in: ['Upcoming', 'Accepted'] }
      }).populate('servicePlan servicePlans assignedEngineer');

      if (overdueCancel.length > 0) {
        console.log(`[StaleJob] Found ${overdueCancel.length} orders for Phase 2 Cancellation`);
      }

      for (const order of overdueCancel) {
        try {
          const oldEngineer = order.assignedEngineer;
          
          // 1. Update Order Status to Cancelled
          await Order.findByIdAndUpdate(order._id, {
            $set: {
              status: 'cancelled',
              orderStatus: 'Cancelled',
              work_status: 'Cancelled',
              noShowPhase: 2,
              failureReason: 'EXPERT_UNAVAILABLE'
            },
            $push: {
              tracking: {
                status: 'UNAVAILABLE',
                title: 'Expert Unavailable',
                subTitle: 'Partner could not reach location within scheduled time.',
                timestamp: new Date()
              }
            }
          }, { runValidators: false });


          // 2. Notify User (Reschedule/Cancel Option)
          await notifyBookingUpdate(order.userId, order._id, 'USER_NOSHOW_ALERT', {
            serviceName: order.servicePlan?.name || order.servicePlans?.[0]?.name || 'scheduled service'
          });

          // 3. Notify Engineer
          if (oldEngineer) {
            await sendPushToEngineer(oldEngineer._id, {
              title: 'Job Cancelled',
              body: 'Your scheduled job was cancelled due to no-show at the location.',
              data: { type: 'SYSTEM', orderId: order._id.toString() }
            });
          }
          console.log(`[StaleJob] Auto-Cancelled No-Show order ${order._id}`);
        } catch (err) { console.error(`[StaleJob] Error cancelling no-show ${order._id}:`, err); }
      }

      // --- CASE 3: VENDOR ORDER TIMEOUT (6 HOURS) ---
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60000);
      const staleVendorOrders = await VendorOrder.find({
        status: { $in: ['PENDING', 'MATCHING'] },
        created_at: { $lte: sixHoursAgo }
      });

      if (staleVendorOrders.length > 0) {
        console.log(`[StaleJob] Found ${staleVendorOrders.length} stale vendor orders for cancellation`);
      }

      for (const vOrder of staleVendorOrders) {
        try {
          const cancellationTrack = {
            status: 'CANCELLED',
            title: 'Order Expired',
            subTitle: 'Cancelled automatically as no expert accepted the order within 6 hours.',
            timestamp: new Date()
          };

          await VendorOrder.findByIdAndUpdate(vOrder._id, {
            $set: {
              status: 'CANCELLED',
              failure_reason: 'NO_ENGINEER_ACCEPTED_6H'
            },
            $push: {
              tracking: cancellationTrack
            }
          }, { runValidators: false });

          console.log(`[StaleJob] Auto-Cancelled stale Vendor Order: ${vOrder._id} (Call ID: ${vOrder.call_id})`);

        } catch (err) {
          console.error(`[StaleJob] Error cancelling stale vendor order ${vOrder._id}:`, err);
        }
      }


    } catch (error) {
      console.error('[StaleOrderJob] Execution error:', error);
    }
  });

  console.log('[StaleOrderJob] Monitor initialized (1-minute intervals)');
};
