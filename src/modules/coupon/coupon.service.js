import mongoose from 'mongoose';
import Coupon from './coupon.model.js';
import CouponUsage from './couponUsage.model.js';
import { generateValidationKey } from './coupon.validator.js';
import { Order } from '../../models/orderSchema.js';

/**
 * Validate coupon against business rules
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.couponCode
 * @param {number} params.amount - in paise
 * @param {Array} params.servicePlans - array of service plan IDs or objects
 */
export const validateCoupon = async ({ userId, couponCode, amount, servicePlans = [] }) => {
  const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });

  if (!coupon) {
    throw new Error('Invalid coupon code');
  }

  const now = new Date();
  if (now < coupon.startDate || now > coupon.endDate) {
    throw new Error('Coupon has expired');
  }

  console.log(`[CouponService] Validating - Input Amount: ${amount}, Min Amount Required: ${coupon.minOrderAmount}, Comparison: ${amount} < ${coupon.minOrderAmount}`);
  if (amount < coupon.minOrderAmount) {
    throw new Error(`Minimum order amount of ₹${(coupon.minOrderAmount / 100).toFixed(2)} required`);
  }


  // Global usage limit check
  if (coupon.usedCount >= coupon.usageLimit) {
    throw new Error('Coupon usage limit reached');
  }

  // Per user limit check
  const userUsageCount = await CouponUsage.countDocuments({
    userId,
    couponId: coupon._id,
    status: 'USED'
  });

  if (userUsageCount >= coupon.perUserLimit) {
    throw new Error('You have already reached the usage limit for this coupon');
  }

  // First time user check
  if (coupon.firstTimeUserOnly) {
    const hasPreviousOrders = await Order.findOne({ userId, status: 'paid' });
    if (hasPreviousOrders) {
      throw new Error('This coupon is only for first-time users');
    }
  }

  // Applicable plans check (if restricted)
  if (coupon.applicablePlans && coupon.applicablePlans.length > 0) {
    const planIds = servicePlans.map(p => p.toString());
    const isApplicable = planIds.some(id => coupon.applicablePlans.map(ap => ap.toString()).includes(id));
    if (!isApplicable) {
      throw new Error('This coupon is not applicable for the selected services');
    }
  }

  // Calculate discount
  let discount = 0;
  if (coupon.type === 'FLAT') {
    discount = coupon.value;
  } else if (coupon.type === 'PERCENTAGE') {
    discount = Math.floor((amount * coupon.value) / 100);
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  }

  const finalAmount = Math.max(0, amount - discount);
  const validationKey = generateValidationKey({ userId, couponId: coupon._id, amount });

  return {
    coupon,
    discount,
    finalAmount,
    validationKey
  };
};

/**
 * Reserve a coupon for an order Using MongoDB Transaction
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.couponId
 * @param {string} params.orderId
 */
export const reserveCoupon = async ({ userId, couponId, orderId }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Atomically increment usedCount if not exceeding limit
    const updatedCoupon = await Coupon.findOneAndUpdate(
      {
        _id: couponId,
        isActive: true,
        $expr: { $lt: ["$usedCount", "$usageLimit"] }
      },
      { $inc: { usedCount: 1 } },
      { session, new: true }
    );

    if (!updatedCoupon) {
      throw new Error('Coupon usage limit reached or coupon inactive');
    }

    // 2. Create CouponUsage record as RESERVED
    // Note: The unique index on {userId, couponId, status: 'RESERVED'}
    // will prevent duplicate active reservations for the same user/coupon.
    await CouponUsage.create([{
      couponId,
      userId,
      orderId,
      status: 'RESERVED'
    }], { session });

    await session.commitTransaction();
    return updatedCoupon;
  } catch (error) {
    await session.abortTransaction();
    if (error.code === 11000) {
      throw new Error('You already have an active reservation for this coupon');
    }
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Mark coupon usage as USED (on payment success)
 */
export const markCouponAsUsed = async (orderId) => {
  return CouponUsage.findOneAndUpdate(
    { orderId, status: 'RESERVED' },
    { status: 'USED' },
    { new: true }
  );
};

/**
 * Mark coupon usage as FAILED (on payment failure or cancellation)
 */
export const markCouponAsFailed = async (orderId) => {
  const usage = await CouponUsage.findOneAndUpdate(
    { orderId, status: 'RESERVED' },
    { status: 'FAILED' },
    { new: true }
  );

  if (usage) {
    // Decrement the usedCount since it was never actually used
    await Coupon.findByIdAndUpdate(usage.couponId, { $inc: { usedCount: -1 } });
  }
  return usage;
};

/**
 * List active coupons for the user
 */
export const getAvailableCoupons = async (userId) => {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    $expr: { $lt: ["$usedCount", "$usageLimit"] }
  }).lean();

  // Optionally filter out those already used by this user to the limit
  // Skipping for brevity, but could be added for better UX
  return coupons;
};

/**
 * Admin: Create a new coupon
 */
export const createCoupon = async (couponData) => {
  return Coupon.create(couponData);
};

/**
 * Admin: Update coupon status (Active/Inactive)
 */
export const updateCouponStatus = async (couponId, isActive) => {
  return Coupon.findByIdAndUpdate(
    couponId,
    { isActive },
    { new: true }
  );
};

/**
 * Admin: Get all coupons (including inactive)
 */
export const getAllCoupons = async (query = {}) => {
  return Coupon.find(query).sort({ createdAt: -1 });
};
