import mongoose from 'mongoose';
import { Order } from '../userOrder/core/userOrder.model.js';

/**
 * Categorize user into segments based on purchase history
 * @param {string} userId 
 * @returns {Promise<string>} - 'NEW' | 'ACTIVE' | 'INACTIVE' | 'VIP'
 */
export const getUserSegment = async (userId) => {
  // Use .lean() for performance
  const orders = await Order.find({ 
    userId: new mongoose.Types.ObjectId(userId), 
    status: { $nin: ['failed', 'cancelled'] } 
  })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();

  const orderCount = orders.length;

  if (orderCount === 0) {
    return 'NEW';
  }

  const lastOrder = orders[0];
  const lastOrderDate = new Date(lastOrder.createdAt);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  if (lastOrderDate < sevenDaysAgo) {
    return 'INACTIVE';
  }

  if (orderCount > 10) {
    return 'VIP';
  }

  return 'ACTIVE';
};
