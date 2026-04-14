import * as couponService from './coupon.service.js';

/**
 * Validate and apply coupon (pre-checkout)
 */
export const applyCoupon = async (req, res) => {
  try {
    const { couponCode, servicePlans } = req.body;
    const amount = Number(req.body.amount || 0);
    const userId = req.user.id;

    const validationResult = await couponService.validateCoupon({
      userId,
      couponCode,
      amount,
      servicePlans
    });


    return res.status(200).json({
      success: true,
      data: validationResult
    });
  } catch (error) {
    console.error('Apply coupon error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to apply coupon'
    });
  }
};

/**
 * List available coupons
 */
export const listAvailableCoupons = async (req, res) => {
  try {
    const userId = req.user.id;
    const coupons = await couponService.getAvailableCoupons(userId);

    return res.status(200).json({
      success: true,
      data: coupons
    });
  } catch (error) {
    console.error('List coupons error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons'
    });
  }
};

/**
 * Reserve coupon (usually handled internally during checkout, but exposed if needed)
 */
export const reserveCoupon = async (req, res) => {
  try {
    const { couponId, orderId } = req.body;
    const userId = req.user.id;

    const result = await couponService.reserveCoupon({ userId, couponId, orderId });

    return res.status(200).json({
      success: true,
      message: 'Coupon reserved successfully',
      data: result
    });
  } catch (error) {
    console.error('Reserve coupon error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to reserve coupon'
    });
  }
};

/**
 * Admin: Create a new coupon
 */
export const adminCreateCoupon = async (req, res) => {
  try {
    const coupon = await couponService.createCoupon(req.body);
    return res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: coupon
    });
  } catch (error) {
    console.error('Admin create coupon error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to create coupon'
    });
  }
};

/**
 * Admin: Toggle coupon status
 */
export const adminToggleStatus = async (req, res) => {
  try {
    const { couponId } = req.params;
    const { isActive } = req.body;

    const coupon = await couponService.updateCouponStatus(couponId, isActive);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: `Coupon ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: coupon
    });
  } catch (error) {
    console.error('Admin toggle status error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to update coupon status'
    });
  }
};

/**
 * Admin: List all coupons
 */
export const adminListAllCoupons = async (req, res) => {
  try {
    const coupons = await couponService.getAllCoupons();
    return res.status(200).json({
      success: true,
      data: coupons
    });
  } catch (error) {
    console.error('Admin list coupons error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons'
    });
  }
};

/**
 * Get the best applicable coupon for the user
 */
export const getBestCoupon = async (req, res) => {
  try {
    const { amount, servicePlans } = req.body;
    const userId = req.user.id;

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'Order amount is required'
      });
    }

    const bestCoupon = await couponService.getBestCoupon({
      userId,
      amount,
      servicePlans
    });

    return res.status(200).json({
      success: true,
      data: bestCoupon
    });
  } catch (error) {
    console.error('Get best coupon error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to find best coupon'
    });
  }
};
