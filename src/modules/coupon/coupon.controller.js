import * as couponService from './coupon.service.js';

/**
 * Validate and apply coupon (pre-checkout)
 */
export const applyCoupon = async (req, res) => {
  try {
    const { couponCode, amount, servicePlans } = req.body;
    const userId = req.user.id;

    if (!couponCode || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code and amount are required'
      });
    }

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
