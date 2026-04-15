import mongoose from 'mongoose';
import couponRepository from './coupon.repository.js';
import usageRepository from './couponUsage.repository.js';
import { Order } from '../../models/orderSchema.js';
import User from '../../models/user.js';

/**
 * Logic for calculating discount (FLAT vs PERCENTAGE)
 */
export const calculateDiscount = (coupon, amount) => {
  let discount = 0;
  if (coupon.type === 'FLAT') {
    discount = coupon.value;
  } else if (coupon.type === 'PERCENTAGE') {
    discount = Math.floor((amount * coupon.value) / 100);
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  }
  return discount;
};

/**
 * Validate coupon against business rules
 */
export const validateCoupon = async ({ userId, couponCode, amount, servicePlans = [] }) => {
  const coupon = await couponRepository.findByCode(couponCode);

  if (!coupon) throw new Error('Invalid coupon code');

  const now = new Date();
  if (now < coupon.startDate || now > coupon.endDate) throw new Error('Coupon has expired');
  if (amount < coupon.minOrderAmount) throw new Error(`Minimum order amount of ₹${(coupon.minOrderAmount / 100).toFixed(2)} required`);

  // Check overall usage limit
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw new Error('Coupon usage limit reached');
  }

  // Check per-user limit
  const userUsageCount = await usageRepository.countUserUsage(userId, coupon._id, 'USED');
  if (userUsageCount >= coupon.perUserLimit) {
    throw new Error('You have already reached the usage limit for this coupon');
  }

  // First-time user check
  if (coupon.targeting?.firstTimeUserOnly) {
    const hasPreviousOrders = await Order.findOne({ userId, status: 'paid' }).lean();
    if (hasPreviousOrders) throw new Error('This coupon is only for first-time users');
  }

  // City check
  if (coupon.targeting?.cities?.length > 0) {
    const user = await User.findById(userId).select('city').lean();
    if (!user?.city || !coupon.targeting.cities.includes(user.city)) {
      throw new Error('Coupon not valid in your location');
    }
  }

  const discount = calculateDiscount(coupon, amount);
  
  return {
    coupon,
    discount,
    finalAmount: Math.max(0, amount - discount)
  };
};

/**
 * Reservation Phase: Triggered when order is created
 */
export const reserveCoupon = async ({ userId, couponId, orderId }, session = null) => {
  // 1. Check for existing active reservation
  const existing = await usageRepository.findActiveReservation(userId, couponId, session);
  if (existing) {
    existing.orderId = orderId;
    await existing.save({ session });
    return existing;
  }

  // 2. Atomic usage update
  const coupon = await couponRepository.atomicIncrementUsage(couponId, session);
  if (!coupon) throw new Error('Coupon usage limit reached or coupon deactivated');

  // 3. Create usage record
  return usageRepository.create({
    couponId,
    userId,
    orderId,
    status: 'RESERVED'
  }, session);
};

/**
 * Commit Phase: Triggered when payment is successful
 */
export const markCouponAsUsed = async (orderId, session = null) => {
  const usage = await usageRepository.updateStatus(orderId, 'RESERVED', 'USED', session);
  if (!usage) return null;
  return usage;
};

/**
 * Rollback Phase: If payment fails or order is cancelled
 */
export const markCouponAsFailed = async (orderId, externalSession = null) => {
  let session = externalSession;
  let ownSession = false;

  if (!session) {
    session = await mongoose.startSession();
    session.startTransaction();
    ownSession = true;
  }

  try {
    const usage = await usageRepository.updateStatus(orderId, 'RESERVED', 'FAILED', session);
    if (usage) {
      await couponRepository.atomicDecrementUsage(usage.couponId, session);
    }

    if (ownSession) await session.commitTransaction();
    return usage;
  } catch (error) {
    if (ownSession) await session.abortTransaction();
    throw error;
  } finally {
    if (ownSession) session.endSession();
  }
};

// Also provide aliases for the commit/rollback phases if needed
export const commitCouponUsage = markCouponAsUsed;
export const rollbackCouponUsage = markCouponAsFailed;
