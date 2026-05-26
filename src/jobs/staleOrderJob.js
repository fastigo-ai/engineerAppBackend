import cron from 'node-cron';
import { Order } from '../models/orderSchema.js';
import VendorOrder from '../modules/vendorOrder/core/vendorOrder.model.js';
import { Engineer } from "../modules/auth/engineer/engineer.model.js";
import { notifyBookingUpdate, sendPushToEngineer } from '../modules/notification/core/notification.facade.js';



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
          await Order.updateOne(
            { _id: order._id },
            {
              $set: { searchingDelayedNotificationSent: true },
              $push: {
                tracking: {
                  status: 'SEARCHING_DELAYED',
                  title: 'Expert Not Found',
                  subTitle: 'Still searching for an expert...',
                  timestamp: new Date()
                }
              }
            }
          );
          console.log(`[StaleJob] Unassigned Alert sent for ${order._id}`);
        } catch (err) { console.error(`[StaleJob] Error notifying unassigned ${order._id}:`, err); }
      }

      // --- CASE 2: ENGINEER NOTIFICATIONS & NO-SHOW MANAGEMENT ---
      console.log(`[StaleJob] Scanning for overdue orders at ${now.toISOString()}...`);

      // PHASE -1: 15-minute Reminder (T-15 minutes)
      const upcomingReminders15m = await Order.find({
        orderStatus: 'Accepted',
        assignedEngineer: { $ne: null },
        scheduledAt: {
          $gte: now,
          $lte: new Date(now.getTime() + 16 * 60000) // Within next 16 minutes
        },
        reminder15mSent: { $ne: true }
      }).populate('assignedEngineer servicePlan');

      for (const order of upcomingReminders15m) {
        try {
          const eng = order.assignedEngineer;
          if (eng) {
            await sendPushToEngineer(eng._id, {
              title: 'Booking Reminder!',
              body: `Hi ${eng.name}, your scheduled booking for ${order.servicePlan?.name || 'your service'} starts in 15 minutes. Please reach the customer location on time.`,
              data: { type: 'MATCHING', orderId: order._id.toString() }
            });
            await Order.updateOne({ _id: order._id }, { $set: { reminder15mSent: true } });
            console.log(`[StaleJob] 15m Reminder sent to engineer for ${order._id}`);
          }
        } catch (err) { console.error(`[StaleJob] Error sending 15m reminder for ${order._id}:`, err); }
      }

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
            await Order.updateOne({ _id: order._id }, { $set: { reminder5mSent: true } });
            console.log(`[StaleJob] 5m Reminder sent to engineer for ${order._id}`);
          }
        } catch (err) { console.error(`[StaleJob] Error sending 5m reminder for ${order._id}:`, err); }
      }

      // PHASE 1: Ping Engineer at T+30 minutes
      const overduePing = await Order.find({
        orderStatus: 'Accepted',
        work_status: { $in: ['Upcoming', 'Accepted'] }, // Haven't started yet
        assignedEngineer: { $ne: null },
        scheduledAt: { $lte: new Date(now.getTime() - 30 * 60000) }, // 30 mins overdue
        noShowPhase: { $in: [0, null] }
      }).populate('assignedEngineer');

      for (const order of overduePing) {
        try {
          const eng = order.assignedEngineer;
          if (eng) {
            await sendPushToEngineer(eng._id, {
              title: 'Are you coming?',
              body: `Hi ${eng.name}, you have a scheduled order starting now. Please start work or reach location immediately.`,
              data: { type: 'MATCHING', orderId: order._id.toString() }
            });
          }
          await Order.updateOne(
            { _id: order._id }, 
            { $set: { noShowPhase: 1, noShowPingedAt: now } }
          );
        } catch (err) { console.error(`[StaleJob] Error updating phase 1 for ${order._id}:`, err); }
      }

      // PHASE 2: Unassign & Mark Unavailable at T+50 minutes (20 mins after ping)
      const overdueUnassign = await Order.find({
        noShowPhase: 1,
        noShowPingedAt: { $lte: new Date(now.getTime() - 20 * 60000) }, // 50 mins total (30 + 20)
        orderStatus: 'Accepted',
        work_status: { $in: ['Upcoming', 'Accepted'] }
      }).populate('servicePlan servicePlans assignedEngineer');

      for (const order of overdueUnassign) {
        try {
          const oldEngineer = order.assignedEngineer;

          // 1. Mark as ExpertUnavailable but keep orderStatus as Upcoming for App visibility
          await Order.findByIdAndUpdate(order._id, {
            $set: {
              status: 'paid',
              orderStatus: 'Upcoming', // Keep as Upcoming so it shows in the Customer App
              work_status: 'ExpertUnavailable', // Hide from nearby list
              assignedEngineer: null,
              acceptedBy: null,
              noShowPhase: 2
            },
            $push: {
              tracking: {
                status: 'UNAVAILABLE',
                title: 'Expert Unavailable',
                subTitle: 'Partner could not reach location. Please reschedule to assign a new expert.',
                timestamp: new Date()
              }
            }
          });

          // 2. Notify User
          await notifyBookingUpdate(order.userId, order._id, 'ENGINEER_DECLINED_REASSIGNING', {
            serviceName: order.servicePlan?.name || 'scheduled service'
          });

          // 3. Notify Engineer
          if (oldEngineer) {
            await sendPushToEngineer(oldEngineer._id, {
              title: 'Order Unassigned',
              body: 'You were unassigned from the job due to no-show at the scheduled time.',
              data: { type: 'SYSTEM', orderId: order._id.toString() }
            });

            // Also mark engineer as available again
            await Engineer.findByIdAndUpdate(oldEngineer._id, { isAvailable: true });
          }

          console.log(`[StaleJob] Auto-Unassigned No-Show order ${order._id} (IDLE)`);
        } catch (err) { console.error(`[StaleJob] Error unassigning no-show ${order._id}:`, err); }
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

      // --- CASE 4: GHOST EXPERT CLEANUP (30 MINUTES) ---
      const thirtyMinsAgo = new Date(now.getTime() - 30 * 60000);
      const ghostResult = await Engineer.updateMany(
        {
          status: 'ONLINE',
          lastHeartbeat: { $lte: thirtyMinsAgo }
        },
        {
          $set: { status: 'OFFLINE' }
        }
      );

      if (ghostResult.modifiedCount > 0) {
        console.log(`[StaleJob] Cleaned up ${ghostResult.modifiedCount} ghost experts (No heartbeat > 30m)`);
      }


    } catch (error) {
      console.error('[StaleOrderJob] Execution error:', error);
    }
  });

  console.log('[StaleOrderJob] Monitor initialized (1-minute intervals)');
};
