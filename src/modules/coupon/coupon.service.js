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
    const hasPreviousOrders = await Order.findOne({ 
      userId, 
      status: { $in: ['paid', 'completed'] } 
    }).lean();
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

/**
 * Generate a user-friendly description for the coupon
 */
const generateDescription = (coupon) => {
  if (coupon.description) return coupon.description;
  
  let desc = '';
  const valueDisp = coupon.type === 'PERCENTAGE' ? `${coupon.value}%` : `₹${(coupon.value / 100).toFixed(0)}`;
  const minDisp = `₹${(coupon.minOrderAmount / 100).toFixed(0)}`;

  desc = `Get ${valueDisp} OFF`;
  if (coupon.minOrderAmount > 0) {
    desc += ` on orders above ${minDisp}`;
  }
  if (coupon.maxDiscount > 0 && coupon.type === 'PERCENTAGE') {
    desc += ` up to ₹${(coupon.maxDiscount / 100).toFixed(0)}`;
  }
  
  return desc;
};

/**
 * List all coupons available to a specific user
 */
export const getAvailableCoupons = async (userId) => {
  const coupons = await couponRepository.findAllActive();
  
  // Get user order history for first-time user check
  const hasPreviousOrders = await Order.findOne({ 
    userId, 
    status: { $in: ['paid', 'completed'] } 
  }).lean();

  const filtered = [];
  for (const coupon of coupons) {
    // 1. Overall usage limit
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) continue;

    // 2. First-time user filter
    if (coupon.targeting?.firstTimeUserOnly && hasPreviousOrders) continue;

    // 3. User segment filter (simplified: assume ACTIVE for now if not specified)
    // In a full implementation, you'd match the user's segment here

    // 4. Per-user limit check
    const userUsageCount = await usageRepository.countUserUsage(userId, coupon._id, 'USED');
    if (userUsageCount >= coupon.perUserLimit) continue;

    // Decorate with description
    filtered.push({
      ...coupon,
      description: generateDescription(coupon)
    });
  }

  return filtered;
};

/**
 * Find the best coupon for a given order
 */
export const getBestCoupon = async ({ userId, amount, servicePlans }) => {
  const available = await getAvailableCoupons(userId);
  let best = null;
  let maxDiscount = -1;

  for (const coupon of available) {
    try {
      // Basic validation for this specific order
      if (amount < coupon.minOrderAmount) continue;

      const discount = calculateDiscount(coupon, amount);
      if (discount > maxDiscount) {
        maxDiscount = discount;
        best = {
          ...coupon,
          calculatedDiscount: discount,
          finalAmount: Math.max(0, amount - discount)
        };
      }
    } catch (e) {
      continue; // Skip invalid coupons for this order
    }
  }
  
  return best;
};

