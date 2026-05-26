import mongoose from 'mongoose';
import couponRepository from './coupon.repository.js';
import usageRepository from './couponUsage.repository.js';
import { Order } from '../userOrder/core/userOrder.model.js';
import User from '../auth/user/user.model.js';
import { ServicePlan } from "../catalog/service/service.model.js";
import Coupon from './coupon.model.js';

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
    throw new Error(`Minimum order amount for this coupon is ₹${(coupon.minOrderAmount / 100).toFixed(0)}. Add ₹${diff.toFixed(0)} more to your cart.`);
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

  // First-time user check
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

  // Specific Users check
  if (coupon.targeting?.specificUsers?.length > 0) {
    const isAllowed = coupon.targeting.specificUsers.some(id => id.toString() === userId.toString());
    if (!isAllowed) {
      throw new Error('This coupon is not valid for your account');
    }
  }

  // --- Plan & Category targeting ---
  if (servicePlans.length > 0) {
    const normalizedPlanIds = servicePlans.map(p => {
      if (typeof p === 'string') return p;
      if (typeof p === 'object') return p.id || p._id || p;
      return p;
    }).filter(id => typeof id === 'string' || mongoose.Types.ObjectId.isValid(id));

    const plansData = await ServicePlan.find({ _id: { $in: normalizedPlanIds } }).populate('category').lean();
    
    if (plansData.length === 0 && normalizedPlanIds.length > 0) {
      console.warn('[ValidateCoupon] No plans found for IDs:', normalizedPlanIds);
    }
    if (coupon.applicablePlans?.length > 0) {
      const planIdsStrings = coupon.applicablePlans.map(id => id.toString());
      const hasApplicablePlan = normalizedPlanIds.some(pid => planIdsStrings.includes(pid.toString()));
      if (!hasApplicablePlan) {
        throw new Error('This coupon is not valid for the selected services');
      }
    }

    if (coupon.applicableCategories?.length > 0) {
      const catIdsStrings = coupon.applicableCategories.map(id => id.toString());
      const matchedPlan = plansData.find(p => p.category && (catIdsStrings.includes(p.category._id.toString()) || catIdsStrings.includes(p.category.toString())));
      
      if (!matchedPlan) {
        throw new Error('This coupon is not valid for the service categories in your cart');
      }
    }
  } else if (coupon.applicablePlans?.length > 0 || coupon.applicableCategories?.length > 0) {
    // If coupon is restricted but no plans provided, we should fail for safety
    throw new Error('This coupon requires specific services which are missing from your cart');
  }

  const discount = calculateDiscount(coupon, amount);
  const finalAmount = Math.max(0, amount - discount);

  return {
    coupon,
    discount,
    finalAmount
  };
};

/**
 * Reserve a coupon for an order
 */
export const reserveCoupon = async ({ userId, couponId, orderId }) => {
  const coupon = await couponRepository.findById(couponId);
  if (!coupon) throw new Error('Coupon not found');

  // Check limits again before reservation to prevent race conditions
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw new Error('Coupon usage limit reached');
  }

  const usage = await usageRepository.create({
    userId,
    couponId,
    orderId,
    status: 'RESERVED'
  });

  return usage;
};

/**
 * Mark coupon as used (Commit phase)
 */
export const markCouponAsUsed = async (usageId) => {
  const usage = await usageRepository.findById(usageId);
  if (!usage || usage.status !== 'RESERVED') return;

  await Promise.all([
    usageRepository.updateStatus(usageId, 'USED'),
    couponRepository.incrementUsedCount(usage.couponId)
  ]);
};

/**
 * Rollback coupon reservation
 */
export const markCouponAsFailed = async (usageId) => {
  const usage = await usageRepository.findById(usageId);
  if (!usage || usage.status !== 'RESERVED') return;

  await usageRepository.updateStatus(usageId, 'FAILED');
};

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
  
  const [hasPreviousOrders, user, userUsages] = await Promise.all([
    Order.findOne({ 
      userId: new mongoose.Types.ObjectId(userId), 
      status: { $in: ['paid', 'completed'] } 
    }).lean(),
    User.findById(userId).select('city').lean(),
    usageRepository.findAllForUser(userId, ['USED', 'RESERVED'])
  ]);

  const usageMap = userUsages.reduce((acc, usage) => {
    const cid = usage.couponId.toString();
    acc[cid] = (acc[cid] || 0) + 1;
    return acc;
  }, {});

  const userSegment = hasPreviousOrders ? 'ACTIVE' : 'NEW';

  const filtered = [];
  for (const coupon of coupons) {
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) continue;
    if (coupon.targeting?.firstTimeUserOnly && hasPreviousOrders) continue;
    if (coupon.targeting?.userSegments?.length > 0 && !coupon.targeting.userSegments.includes(userSegment)) continue;
    if (coupon.targeting?.cities?.length > 0 && (!user?.city || !coupon.targeting.cities.includes(user.city))) continue;
    if (coupon.isHidden) continue;
    if (coupon.targeting?.specificUsers?.length > 0) {
      const isAllowed = coupon.targeting.specificUsers.some(id => id.toString() === userId.toString());
      if (!isAllowed) continue;
    }

    const usageCount = usageMap[coupon._id.toString()] || 0;
    if (usageCount >= coupon.perUserLimit) continue;

    let badge = null;
    if (coupon.targeting?.firstTimeUserOnly) {
      badge = "New User Offer";
    } else if (coupon.perUserLimit === 1) {
      badge = "One-time use";
    }

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
      continue;
    }
  }
  
  return best;
};

/**
 * Admin: Create a new coupon
 */
export const createCoupon = async (couponData) => {
  if (couponData.code) {
    couponData.code = couponData.code.toUpperCase().trim();
    const existing = await couponRepository.findByCode(couponData.code);
    if (existing) {
      throw new Error(`Coupon with code ${couponData.code} already exists`);
    }
  }

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

/**
 * Admin: Update an existing coupon
 */
export const updateCoupon = async (couponId, updateData) => {
  if (updateData.code) {
    updateData.code = updateData.code.toUpperCase().trim();
    const existing = await couponRepository.findByCode(updateData.code);
    if (existing && existing._id.toString() !== couponId.toString()) {
      throw new Error(`Coupon with code ${updateData.code} already exists`);
    }
  }

  const updated = await Coupon.findByIdAndUpdate(
    couponId,
    { $set: updateData },
    { new: true, runValidators: true }
  ).lean();

  return updated;
};
