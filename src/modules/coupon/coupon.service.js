import mongoose from 'mongoose';
import couponRepository from './coupon.repository.js';
import usageRepository from './couponUsage.repository.js';
import { Order } from '../../models/orderSchema.js';
import User from '../../models/user.js';
import { ServicePlan } from '../../models/serviceModal.js';


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
  if (now < coupon.startDate) throw new Error('This coupon is not yet active');
  if (now > coupon.endDate) throw new Error('This coupon has expired');
  
  if (amount < coupon.minOrderAmount) {
    const diff = (coupon.minOrderAmount - amount) / 100;
    throw new Error(`Add ₹${diff.toFixed(0)} more to your cart to use this coupon`);
  }


  // Check overall usage limit
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw new Error('Coupon usage limit reached');
  }

  // Check per-user limit (including active reservations)
  const userUsageCount = await usageRepository.countUserUsage(userId, coupon._id, ['USED', 'RESERVED']);
  if (userUsageCount >= coupon.perUserLimit) {
    throw new Error('You have already reached the usage limit for this coupon');
  }

  // First-time user check: Treat only 'paid' or 'completed' orders as a "previous order"
  const hasPreviousOrders = await Order.findOne({ 
    userId: new mongoose.Types.ObjectId(userId), 
    status: { $in: ['paid', 'completed'] } 
  }).lean();

  if (coupon.targeting?.firstTimeUserOnly && hasPreviousOrders) {
    throw new Error('This coupon is only for first-time users');
  }

  // User Segment check
  if (coupon.targeting?.userSegments?.length > 0) {
    const userSegment = hasPreviousOrders ? 'ACTIVE' : 'NEW';
    if (!coupon.targeting.userSegments.includes(userSegment)) {
      throw new Error(`This coupon is only valid for ${coupon.targeting.userSegments.join('/')} users`);
    }
  }

  // City check
  if (coupon.targeting?.cities?.length > 0) {
    const user = await User.findById(userId).select('city').lean();
    if (!user?.city || !coupon.targeting.cities.includes(user.city)) {
      throw new Error(`This coupon is not available in ${user?.city || 'your location'}`);
    }
  }

  // --- Plan & Category targeting ---
  if (servicePlans.length > 0) {
    // Normalize servicePlans to be an array of IDs (strings)
    const normalizedPlanIds = servicePlans.map(p => (typeof p === 'object' && p.id) ? p.id : p);
    
    const plansData = await ServicePlan.find({ _id: { $in: normalizedPlanIds } }).populate('category').lean();
    
    // 1. Check applicablePlans
    if (coupon.applicablePlans?.length > 0) {
      const planIdsStrings = coupon.applicablePlans.map(id => id.toString());
      const hasApplicablePlan = servicePlans.some(pid => planIdsStrings.includes(pid.toString()));
      if (!hasApplicablePlan) {
        throw new Error('This coupon is not valid for the selected service(s)');
      }
    }

    // 2. Check applicableCategories
    if (coupon.targeting?.applicableCategories?.length > 0) {
      const hasApplicableCategory = plansData.some(p => 
        coupon.targeting.applicableCategories.includes(p.category?.name)
      );
      if (!hasApplicableCategory) {
        const allowed = coupon.targeting.applicableCategories.join(', ');
        throw new Error(`This coupon is only valid for ${allowed} services`);
      }
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

  // Increment redemption count for analytics
  await couponRepository.incrementRedeemed(usage.couponId, session);

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
  
  // 1. Get user data (orders, profile, and coupon usage) once
  const [hasPreviousOrders, user, userUsages] = await Promise.all([
    Order.findOne({ 
      userId: new mongoose.Types.ObjectId(userId), 
      status: { $in: ['paid', 'completed'] } 
    }).lean(),
    User.findById(userId).select('city').lean(),
    usageRepository.findAllForUser(userId, ['USED', 'RESERVED'])
  ]);

  // Create a map of usage counts for efficiency
  const usageMap = userUsages.reduce((acc, usage) => {
    const cid = usage.couponId.toString();
    acc[cid] = (acc[cid] || 0) + 1;
    return acc;
  }, {});

  const userSegment = hasPreviousOrders ? 'ACTIVE' : 'NEW';

  const filtered = [];
  for (const coupon of coupons) {
    // 2. Overall usage limit
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) continue;

    // 3. First-time user filter
    if (coupon.targeting?.firstTimeUserOnly && hasPreviousOrders) continue;

    // 4. User segment filter
    if (coupon.targeting?.userSegments?.length > 0) {
      if (!coupon.targeting.userSegments.includes(userSegment)) continue;
    }

    // 5. City filter
    if (coupon.targeting?.cities?.length > 0) {
      if (!user?.city || !coupon.targeting.cities.includes(user.city)) continue;
    }

    // 6. Per-user limit check
    const usageCount = usageMap[coupon._id.toString()] || 0;
    const isLimitReached = usageCount >= coupon.perUserLimit;

    // IF LIMIT REACHED, DO NOT SHOW IN AVAILABLE LIST
    if (isLimitReached) continue;

    // Determine badge
    let badge = null;
    if (coupon.targeting?.firstTimeUserOnly) {
      badge = "New User Offer";
    } else if (coupon.perUserLimit === 1) {
      badge = "One-time use";
    }

    // Decorate with description, badge, and usability info
    filtered.push({
      ...coupon,
      description: generateDescription(coupon),
      badge,
      isUsable: true,
      limitReached: false
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
          finalAmount: Math.max(0, amount - discount),
          badge: coupon.badge
        };
      }
    } catch (e) {
      continue; // Skip invalid coupons for this order
    }
  }
  
  return best;
};

/**
 * Admin: Create a new coupon
 */
export const createCoupon = async (couponData) => {
  // Normalize code
  if (couponData.code) {
    couponData.code = couponData.code.toUpperCase().trim();
    
    // Check for duplicate code
    const existing = await couponRepository.findByCode(couponData.code);
    if (existing) {
      throw new Error(`Coupon with code ${couponData.code} already exists`);
    }
  }

  // Set default dates if not provided
  if (!couponData.startDate) couponData.startDate = new Date();
  if (!couponData.endDate) {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    couponData.endDate = nextMonth;
  }

  return couponRepository.create(couponData);
};

/**
 * Admin: List all coupons
 */
export const getAllCoupons = async () => {
  return couponRepository.findAll();
};

/**
 * Admin: Update coupon active status
 */
export const updateCouponStatus = async (couponId, isActive) => {
  return couponRepository.updateStatus(couponId, isActive);
};

/**
 * Admin: Delete a coupon
 */
export const deleteCoupon = async (couponId) => {
  return couponRepository.delete(couponId);
};

