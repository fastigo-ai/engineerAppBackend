import cron from 'node-cron';
import CouponUsage from './couponUsage.model.js';
import Coupon from './coupon.model.js';

/**
 * Initialize Coupon Cleanup Cron Job
 * Runs every 15 minutes
 */
export const initCouponCron = () => {
  cron.schedule('*/15 * * * *', async () => {
    console.log('--- Running Coupon Cleanup Cron ---');

    try {
      // Find reservations older than 30 minutes
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const expiredReservations = await CouponUsage.find({
        status: 'RESERVED',
        createdAt: { $lt: thirtyMinutesAgo }
      });

      console.log(`Found ${expiredReservations.length} expired coupon reservations`);

      for (const reservation of expiredReservations) {
        try {
          // Mark as FAILED
          reservation.status = 'FAILED';
          await reservation.save();

          // Decrement usedCount and increment failed count
          await Coupon.findByIdAndUpdate(reservation.couponId, {
            $inc: { 
              usedCount: -1,
              "stats.totalFailed": 1
            }
          });

          console.log(`Released coupon ${reservation.couponId} from order ${reservation.orderId}`);
        } catch (error) {
          console.error(`Failed to release coupon reservation ${reservation._id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Coupon Cron Error:', error);
    }
  });
};
