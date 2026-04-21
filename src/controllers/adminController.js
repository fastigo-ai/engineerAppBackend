import { Order } from '../models/orderSchema.js';

/**
 * Get all orders that are pending a refund
 * Filter: refundStatus === 'PENDING'
 */
export const getPendingRefunds = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);

    const [orders, count] = await Promise.all([
      Order.find({ refundStatus: 'PENDING' })
        .populate('userId', 'name email mobile')
        .sort({ updatedAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      Order.countDocuments({ refundStatus: 'PENDING' })
    ]);

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          totalOrders: count,
          totalPages,
          currentPage: page,
          limit,
          hasMore: page < totalPages
        }
      }
    });
  } catch (error) {
    console.error('[AdminController] Get pending refunds error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending refunds',
      error: error.message
    });
  }
};
