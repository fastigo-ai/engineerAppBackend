import Coupon from './coupon.model.js';

export class CouponRepository {
  /**
   * Find an active coupon by code
   */
  async findByCode(code) {
    return Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  }

  /**
   * Find a coupon by ID
   */
  async findById(id, session = null) {
    return Coupon.findById(id).session(session);
  }

  /**
   * Atomically increment usedCount if it hasn't reached usageLimit
   * usageLimit 0 means unlimited
   */
  async atomicIncrementUsage(couponId, session = null) {
    return Coupon.findOneAndUpdate(
      {
        _id: couponId,
        isActive: true,
        $or: [
          { usageLimit: 0 },
          { $expr: { $lt: ["$usedCount", "$usageLimit"] } }
        ]
      },
      { $inc: { usedCount: 1 } },
      { session, new: true }
    );
  }

  /**
   * Atomically decrement usedCount (used for rollback/failure)
   */
  async atomicDecrementUsage(couponId, session = null) {
    return Coupon.findByIdAndUpdate(
      couponId,
      { $inc: { usedCount: -1 } },
      { session, new: true }
    );
  }
}

export default new CouponRepository();
