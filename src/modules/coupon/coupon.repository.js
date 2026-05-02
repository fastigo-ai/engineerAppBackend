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
   * Find all active coupons within validity period
   */
  async findAllActive() {
    const now = new Date();
    return Coupon.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).lean();
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
      { 
        $inc: { 
          usedCount: 1,
          "stats.totalApplied": 1
        } 
      },
      { session, new: true }
    );
  }

  /**
   * Atomically decrement usedCount (used for rollback/failure)
   */
  async atomicDecrementUsage(couponId, session = null) {
    return Coupon.findByIdAndUpdate(
      couponId,
      { 
        $inc: { 
          usedCount: -1,
          "stats.totalFailed": 1
        } 
      },
      { session, new: true }
    );
  }

  /**
   * Increment redemption count (successful conversion)
   */
  async incrementRedeemed(couponId, session = null) {
    return Coupon.findByIdAndUpdate(
      couponId,
      { $inc: { "stats.totalRedeemed": 1 } },
      { session, new: true }
    );
  }

  /**
   * Create a new coupon
   */
  async create(data) {
    return Coupon.create(data);
  }

  /**
   * Find all coupons (admin)
   */
  async findAll() {
    return Coupon.find().sort({ createdAt: -1 }).lean();
  }

  /**
   * Update coupon status
   */
  async updateStatus(id, isActive) {
    return Coupon.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );
  }

  /**
   * Delete a coupon
   */
  async delete(id) {
    return Coupon.findByIdAndDelete(id);
  }
}

export default new CouponRepository();
