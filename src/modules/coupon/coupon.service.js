import mongoose from 'mongoose';
import Coupon from './coupon.model.js';
import CouponUsage from './couponUsage.model.js';
import { generateValidationKey } from './coupon.validator.js';
import { Order } from '../../models/orderSchema.js';
import User from '../../models/user.js';
import { getUserSegment } from '../user/user.segment.js';

/**
 * Validate coupon against business rules
 */
export const validateCoupon = async ({ userId, couponCode, amount, servicePlans = [], isSilent = false }) => {
  try {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true }).lean();

    if (!coupon) {
      throw new Error('Invalid coupon code');
    }

    const now = new Date();
    if (now < coupon.startDate || now > coupon.endDate) {
      throw new Error('Coupon has expired');
    }

    if (amount < coupon.minOrderAmount) {
      throw new Error(`Minimum order amount of ₹${(coupon.minOrderAmount / 100).toFixed(2)} required`);
    }

    // Fix: usageLimit 0 means unlimited. 
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
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

    // --- TARGETING CHECKS ---
    if (coupon.targeting?.userSegments?.length > 0) {
      const segment = await getUserSegment(userId);
      if (!coupon.targeting.userSegments.includes(segment)) {
        throw new Error('Coupon not applicable for your account segment');
      }
    }

    if (coupon.targeting?.firstTimeUserOnly) {
      const hasPreviousOrders = await Order.findOne({ userId, status: 'paid' }).lean();
      if (hasPreviousOrders) {
        throw new Error('This coupon is only for first-time users');
      }
    }

    if (coupon.targeting?.cities?.length > 0) {
      const user = await User.findById(userId).select('city').lean();
      if (!user?.city || !coupon.targeting.cities.includes(user.city)) {
        throw new Error('Coupon not valid in your location');
      }
    }

    if (coupon.targeting?.applicableCategories?.length > 0) {
      const hasValidCategory = servicePlans.some(plan => {
        const categoryName = typeof plan.category === 'string' 
          ? plan.category 
          : plan.category?.name;
        return coupon.targeting.applicableCategories.includes(categoryName);
      });

      if (!hasValidCategory) {
        throw new Error('Coupon not applicable for selected services');
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
  } catch (error) {
    const isValidationError = error.name === 'ValidationError' || 
                             ['Invalid', 'expired', 'limit', 'applicable', 'valid', 'required'].some(kw => error.message.includes(kw));
    
    if (isSilent && isValidationError) return null;
    throw error;
  }
};

/**
 * Find the best applicable coupon for the user
 */
export const getBestCoupon = async ({ userId, amount, servicePlans = [] }) => {
  const now = new Date();
  
  // Pre-filter basic rules in DB
  const activeCoupons = await Coupon.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    minOrderAmount: { $lte: amount },
    $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }]
  }).lean();

  if (!activeCoupons.length) return null;

  // Parallel validation
  const results = await Promise.allSettled(
    activeCoupons.map(coupon => validateCoupon({
      userId,
      couponCode: coupon.code,
      amount,
      servicePlans,
      isSilent: true
    }))
  );

  const applicableCoupons = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  // Sort by highest discount
  return applicableCoupons.sort((a, b) => b.discount - a.discount)[0] || null;
};

/**
 * Reserve a coupon for an order
 * Refactored: Accepts an external session to be part of an atomic checkout transaction.
 */
export const reserveCoupon = async ({ userId, couponId, orderId }, session = null) => {
  // 1. Check if an active reservation already exists for this user and coupon
  const existingReservation = await CouponUsage.findOne({
    userId,
    couponId,
    status: 'RESERVED'
  }).session(session);

  if (existingReservation) {
    // If a reservation exists, just update the orderId to the latest attempt
    existingReservation.orderId = orderId;
    await existingReservation.save({ session });
    
    return await Coupon.findById(couponId).session(session);
  }

  // 2. Normal flow: Atomically increment usedCount if not exceeding limit
  const updatedCoupon = await Coupon.findOneAndUpdate(
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

  if (!updatedCoupon) {
    throw new Error('Coupon usage limit reached or coupon inactive');
  }

  // 3. Create CouponUsage record as RESERVED
  await CouponUsage.create([{
    couponId,
    userId,
    orderId,
    status: 'RESERVED'
  }], { session });

  return updatedCoupon;
};

/**
 * Mark coupon usage as USED (Idempotent)
 */
export const markCouponAsUsed = async (orderId, session = null) => {
  const usage = await CouponUsage.findOne({ orderId }).session(session);
  
  if (!usage) return null;
  if (usage.status === 'USED') return usage; // Already processed
  if (usage.status !== 'RESERVED') {
    throw new Error(`Cannot mark coupon as USED. Current status: ${usage.status}`);
  }

  usage.status = 'USED';
  await usage.save({ session });
  return usage;
};

/**
 * Mark coupon usage as FAILED (Atomic)
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
    const usage = await CouponUsage.findOneAndUpdate(
      { orderId, status: 'RESERVED' },
      { status: 'FAILED' },
      { session, new: true }
    );

    if (usage) {
      // Decrement the usedCount since it was never actually used
      await Coupon.findByIdAndUpdate(usage.couponId, { $inc: { usedCount: -1 } }, { session });
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
