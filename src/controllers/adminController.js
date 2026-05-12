import { Order } from '../models/orderSchema.js';
import { ServicePlan } from '../models/serviceModal.js';
import User from '../models/user.js';
import { Engineer } from '../models/engineersModal.js';
import { WithdrawalRequest } from '../models/WithdrawalRequest.js';
import { Wallet } from '../models/Wallet.js';
import { Ledger } from '../models/Ledger.js';
import { BankAccount } from '../models/BankAccount.js';
import Notification from '../modules/notification/Notification.model.js';
import * as payoutService from '../services/payoutService.js';
import mongoose from 'mongoose';
import STATUS_CODES from '../constants/statusCodes.js';

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

/**
 * Get all pending withdrawal requests
 */
export const getPendingPayouts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);

    const [withdrawals, count] = await Promise.all([
      WithdrawalRequest.find({ status: 'requested' })
        .populate('engineerId', 'name mobile email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      WithdrawalRequest.countDocuments({ status: 'requested' })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        withdrawals,
        pagination: {
          total: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          limit
        }
      }
    });
  } catch (error) {
    console.error('[AdminController] Get pending payouts error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch payouts', error: error.message });
  }
};

/**
 * Approve a withdrawal request
 */
export const approvePayout = async (req, res) => {
  try {
    const { id } = req.params;

    const withdrawal = await WithdrawalRequest.findById(id);
    if (!withdrawal || withdrawal.status !== 'requested') {
      return res.status(400).json({ success: false, message: 'Invalid or already processed request' });
    }

    const bankAccount = await BankAccount.findOne({ engineerId: withdrawal.engineerId, isVerified: true });
    if (!bankAccount) {
      return res.status(400).json({ success: false, message: 'Verified bank account not found for engineer' });
    }

    const ledger = await Ledger.findOne({ referenceId: id });
    if (!ledger) {
        return res.status(400).json({ success: false, message: 'Ledger entry not found' });
    }

    // 1. Mark as processing
    withdrawal.status = 'processing';
    await withdrawal.save();

    // 2. Call Razorpay
    try {
      const payout = await payoutService.createPayout({
        fundAccountId: bankAccount.fundAccountId,
        amount: withdrawal.netAmount,
        referenceId: withdrawal._id.toString(),
        idempotencyKey: ledger.idempotencyKey
      });

      withdrawal.payoutId = payout.id;
      // status will be updated to success via webhook or manually later? 
      // For now let's keep it simple as the original code did.
      await withdrawal.save();

      return res.status(200).json({
        success: true,
        message: 'Payout approved and initiated successfully',
        data: { payoutId: payout.id }
      });
    } catch (payoutError) {
      console.error('[AdminController] Razorpay payout error:', payoutError);
      withdrawal.status = 'requested'; // Revert to requested if API call fails
      await withdrawal.save();
      return res.status(500).json({ success: false, message: 'Razorpay payout failed', error: payoutError.message });
    }
  } catch (error) {
    console.error('[AdminController] Approve payout error:', error);
    return res.status(500).json({ success: false, message: 'Approval failed', error: error.message });
  }
};

/**
 * Reject a withdrawal request
 */
export const rejectPayout = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { reason } = req.body;

    const withdrawal = await WithdrawalRequest.findById(id).session(session);
    if (!withdrawal || withdrawal.status !== 'requested') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid or already processed request' });
    }

    // 1. Update Withdrawal Status
    withdrawal.status = 'rejected';
    withdrawal.failureReason = reason || 'Rejected by Admin';
    await withdrawal.save({ session });

    // 2. Update Ledger Status
    await Ledger.findOneAndUpdate(
        { referenceId: id },
        { status: 'rejected' },
        { session }
    );

    // 3. Refund Engineer Wallet
    const wallet = await Wallet.findOne({ engineerId: withdrawal.engineerId }).session(session);
    if (wallet) {
      wallet.lockedBalance -= withdrawal.amount;
      wallet.availableBalance += withdrawal.amount;
      await wallet.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ success: true, message: 'Payout request rejected and funds returned to wallet' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[AdminController] Reject payout error:', error);
    return res.status(500).json({ success: false, message: 'Rejection failed', error: error.message });
  }
};
/**
 * Get advanced dashboard stats using aggregation
 */
export const getDashboardStats = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [stats] = await Order.aggregate([
      {
        $facet: {
          // 1. Revenue Growth Curve (Last 30 Days)
          revenueGrowth: [
            {
              $match: {
                createdAt: { $gte: thirtyDaysAgo },
                status: { $in: ['paid', 'completed'] }
              }
            },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                revenue: { $sum: { $divide: ["$finalAmount", 100] } }, // finalAmount is in paise
                count: { $sum: 1 }
              }
            },
            { $sort: { "_id": 1 } }
          ],

          // 2. Service Demand (By Category)
          serviceDemand: [
            {
              $lookup: {
                from: 'service_plans',
                localField: 'servicePlan',
                foreignField: '_id',
                as: 'plan'
              }
            },
            { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'categories',
                localField: 'plan.category',
                foreignField: '_id',
                as: 'cat'
              }
            },
            { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: { $ifNull: ["$cat.name", "Uncategorized"] },
                value: { $sum: 1 }
              }
            }
          ],

          // 3. Fulfillment Speed (Calculated from tracking array or specific timestamps)
          fulfillmentSpeed: [
            {
              $match: {
                orderStatus: 'Completed',
                createdAt: { $exists: true },
                updatedAt: { $exists: true }
              }
            },
            {
              $project: {
                totalTime: { $divide: [{ $subtract: ["$updatedAt", "$createdAt"] }, 60000] }, // minutes
                assignmentTime: {
                  $cond: [
                    { $and: [{ $gt: ["$acceptedBy", null] }, { $size: { $ifNull: ["$tracking", []] } }] },
                    {
                      $divide: [
                        {
                          $subtract: [
                            { $arrayElemAt: ["$tracking.timestamp", 1] }, // Usually the first update after creation is assignment
                            "$createdAt"
                          ]
                        },
                        60000
                      ]
                    },
                    15 // Default fallback if no tracking
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                avgCompletionTime: { $avg: "$totalTime" },
                avgAssignmentTime: { $avg: "$assignmentTime" }
              }
            }
          ],
          // 4. Financial Health (Total Collected)
          totalCollected: [
            { $match: { status: { $in: ['paid', 'completed'] } } },
            { $group: { _id: null, amount: { $sum: "$finalAmount" } } }
          ],

          // 5. Pending Payouts
          pendingPayouts: [
            { $limit: 1 }, 
            {
              $lookup: {
                from: 'withdrawal_requests',
                pipeline: [{ $match: { status: 'requested' } }],
                as: 'withdrawals'
              }
            },
            { $unwind: { path: '$withdrawals', preserveNullAndEmptyArrays: true } },
            { $group: { _id: null, amount: { $sum: "$withdrawals.amount" } } }
          ],

          // 6. User Growth (New Registrations)
          userGrowth: [
             { $limit: 1 },
             {
               $lookup: {
                 from: 'users',
                 pipeline: [
                   { $match: { createdAt: { $gte: thirtyDaysAgo }, role: 'user' } },
                   {
                     $group: {
                       _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                       count: { $sum: 1 }
                     }
                   },
                   { $sort: { "_id": 1 } }
                 ],
                 as: 'users'
               }
             }
          ],

          // 7. Coupon Impact
          couponImpact: [
            {
              $group: {
                _id: { $cond: [{ $gt: ["$couponId", null] }, "Discounted", "Regular"] },
                count: { $sum: 1 },
                revenue: { $sum: { $divide: ["$finalAmount", 100] } }
              }
            }
          ],

          // 8. Repeat Customers
          repeatCustomers: [
            {
              $group: {
                _id: "$userId",
                orderCount: { $sum: 1 }
              }
            },
            {
              $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                repeatUsers: { $sum: { $cond: [{ $gt: ["$orderCount", 1] }, 1, 0] } }
              }
            }
          ],

          // 9. Engineer Utilization
          engineerUtilization: [
             { $limit: 1 },
             {
               $lookup: {
                 from: 'engineers',
                 pipeline: [
                   {
                     $group: {
                       _id: "$status",
                       count: { $sum: 1 }
                     }
                   }
                 ],
                 as: 'engineers'
               }
             }
          ],

          // 10. Supply-Demand Gap (By H3 Index)
          supplyDemandGap: [
            {
              $match: { h3Index: { $exists: true } }
            },
            {
              $group: {
                _id: "$h3Index",
                demand: { $sum: 1 }
              }
            },
            { $sort: { demand: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: 'engineers',
                localField: '_id',
                foreignField: 'h3Index',
                as: 'engineers'
              }
            },
            {
              $project: {
                h3Index: "$_id",
                demand: 1,
                supply: { $size: "$engineers" }
              }
            }
          ],

          // 11. Notification Health
          notificationHealth: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);

    // Format the response
    const totalCollectedPaise = stats.totalCollected[0]?.amount || 0;
    const pendingPayoutsPaise = stats.pendingPayouts[0]?.amount || 0;
    const repeatData = stats.repeatCustomers[0] || { totalUsers: 1, repeatUsers: 0 };
    const utilData = stats.engineerUtilization[0]?.engineers || [];
    
    // Notification logic
    const notifData = stats.notificationHealth || [];
    const sent = notifData.find(n => n._id === 'SENT')?.count || 0;
    const failed = notifData.find(n => n._id === 'FAILED')?.count || 0;
    const totalNotifs = sent + failed || 1;
    const successRate = ((sent / totalNotifs) * 100).toFixed(1);

    const formattedStats = {
      revenueGrowth: stats.revenueGrowth.map(item => ({
        date: item._id,
        amount: Math.round(item.revenue)
      })),
      userGrowth: stats.userGrowth[0]?.users || [],
      serviceDemand: stats.serviceDemand.map(item => ({
        name: item._id,
        value: item.value
      })),
      fulfillment: stats.fulfillmentSpeed[0] || { avgCompletionTime: 45, avgAssignmentTime: 12 },
      financial: {
        totalCollected: totalCollectedPaise / 100,
        pendingPayouts: pendingPayoutsPaise / 100,
        commission: (totalCollectedPaise / 100) * 0.25
      },
      growth: {
        couponImpact: stats.couponImpact,
        repeatRate: ((repeatData.repeatUsers / repeatData.totalUsers) * 100).toFixed(1),
        utilization: {
          busy: utilData.find(u => u._id === 'BUSY')?.count || 0,
          online: utilData.find(u => u._id === 'ONLINE')?.count || 0,
          offline: utilData.find(u => u._id === 'OFFLINE')?.count || 0
        },
        supplyDemandGap: stats.supplyDemandGap,
        notificationHealth: {
          successRate,
          sent,
          failed
        }
      }
    };


    res.status(200).json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    console.error('[AdminController] Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics', error: error.message });
  }
};
