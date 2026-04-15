import CouponUsage from './couponUsage.model.js';

export class CouponUsageRepository {
  /**
   * Create a new usage record (usually RESERVED)
   */
  async create(data, session = null) {
    if (session) {
      return CouponUsage.create([data], { session });
    }
    return CouponUsage.create(data);
  }

  /**
   * Find usage by orderId
   */
  async findByOrderId(orderId, session = null) {
    return CouponUsage.findOne({ orderId }).session(session);
  }

  /**
   * Find an active reservation for a user and coupon
   */
  async findActiveReservation(userId, couponId, session = null) {
    return CouponUsage.findOne({
      userId,
      couponId,
      status: 'RESERVED'
    }).session(session);
  }

  /**
   * Update status atomically
   */
  async updateStatus(orderId, fromStatus, toStatus, session = null) {
    return CouponUsage.findOneAndUpdate(
      { orderId, status: fromStatus },
      { status: toStatus },
      { session, new: true }
    );
  }

  /**
   * Count usage by user and coupon
   */
  async countUserUsage(userId, couponId, status = 'USED') {
    return CouponUsage.countDocuments({
      userId,
      couponId,
      status
    });
  }
}

export default new CouponUsageRepository();
