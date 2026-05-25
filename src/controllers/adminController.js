import { Order } from '../models/orderSchema.js';
import { ServicePlan } from "../modules/catalog/service/service.model.js";
import User from '../models/user.js';
import { Engineer } from '../models/engineersModal.js';
import { WithdrawalRequest } from "../modules/finance/wallet/WithdrawalRequest.model.js";
import { Wallet } from "../modules/finance/wallet/Wallet.model.js";
import { Ledger } from "../modules/finance/ledger/Ledger.model.js";
import { BankAccount } from '../models/BankAccount.js';
import Notification from '../modules/notification/core/Notification.model.js';
import * as payoutService from "../modules/finance/payouts/payout.service.js";
import { notifyEngineersForOrder } from '../services/notificationEngineerService.js';
import { getIO } from '../config/socket.js';
import mongoose from 'mongoose';
import STATUS_CODES from '../constants/statusCodes.js';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get all orders that are pending a refund
 * Filter: refundStatus === 'PENDING'
 */
export const getPendingRefunds = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);

    const { search } = req.query;

    let query = { refundStatus: 'PENDING' };
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.$or = [
        { userId: { $in: users.map(u => u._id) } },
        { orderId: { $regex: search, $options: 'i' } }
      ];
    }

    const [orders, count] = await Promise.all([
      Order.find(query)
        .populate('userId', 'name email mobile')
        .sort({ updatedAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      Order.countDocuments(query)
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

    const { search } = req.query;

    let query = { status: 'requested' };
    if (search) {
      const engineers = await Engineer.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.engineerId = { $in: engineers.map(e => e._id) };
    }

    const [withdrawals, count] = await Promise.all([
      WithdrawalRequest.find(query)
        .populate('engineerId', 'name mobile email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      WithdrawalRequest.countDocuments(query)
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

/**
 * Search users by name or mobile for coupon targeting
 */
export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.status(200).json({ success: true, data: [] });
    }

    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { mobile: { $regex: query, $options: 'i' } }
      ],
      role: 'customer'
    })
    .select('name mobile email _id')
    .limit(10)
    .lean();

    return res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('[AdminController] Search users error:', error);
    return res.status(500).json({ success: false, message: 'Search failed' });
  }
};

/**
 * Get Ledger/Transaction history with filters
 */
export const getLedger = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 20);
    const { engineerId, category, type, search } = req.query;

    let query = {};
    if (engineerId) query.engineerId = engineerId;
    if (category) query.category = category;
    if (type) query.type = type;

    if (search) {
      const engineers = await Engineer.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.engineerId = { $in: engineers.map(e => e._id) };
    }

    const [transactions, count] = await Promise.all([
      Ledger.find(query)
        .populate('engineerId', 'name mobile')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      Ledger.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          limit
        }
      }
    });
  } catch (error) {
    console.error('[AdminController] Get ledger error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch ledger', error: error.message });
  }
};

/**
 * Get all engineer wallets with engineer details
 */
export const getAllWallets = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const search = req.query.search || '';

    let query = {};
    if (search) {
      const engineers = await Engineer.find({
        name: { $regex: search, $options: 'i' }
      }).select('_id');
      query.engineerId = { $in: engineers.map(e => e._id) };
    }

    const [wallets, count] = await Promise.all([
      Wallet.find(query)
        .populate('engineerId', 'name mobile email')
        .sort({ availableBalance: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      Wallet.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        wallets,
        pagination: {
          total: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          limit
        }
      }
    });
  } catch (error) {
    console.error('[AdminController] Get all wallets error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch wallets', error: error.message });
  }
};

/**
 * Get Finance-specific analytics (Revenue, Commission, Top Earners)
 */
export const getFinanceStats = async (req, res) => {
  try {
    const [stats] = await Order.aggregate([
      {
        $facet: {
          revenue: [
            { $match: { status: { $in: ['paid', 'completed'] } } },
            {
              $group: {
                _id: null,
                totalGross: { $sum: "$finalAmount" }
              }
            }
          ],
          payouts: [
            {
              $lookup: {
                from: 'withdrawal_requests',
                pipeline: [{ $match: { status: 'success' } }],
                as: 'completed'
              }
            },
            { $unwind: { path: "$completed", preserveNullAndEmptyArrays: true } },
            { $group: { _id: null, totalPaid: { $sum: "$completed.amount" } } }
          ],
          topEarners: [
            {
              $lookup: {
                from: 'wallets',
                pipeline: [
                  { $sort: { withdrawnAmount: -1 } },
                  { $limit: 5 },
                  {
                    $lookup: {
                      from: 'engineers',
                      localField: 'engineerId',
                      foreignField: '_id',
                      as: 'details'
                    }
                  },
                  { $unwind: "$details" }
                ],
                as: 'earners'
              }
            }
          ]
        }
      }
    ]);

    const gross = (stats.revenue[0]?.totalGross || 0) / 100;
    const paid = stats.payouts[0]?.totalPaid || 0;
    const commission = gross * 0.25; 

    return res.status(200).json({
      success: true,
      data: {
        metrics: {
          totalGross: gross,
          totalCommission: commission,
          totalPaidOut: paid,
          netPlatformBalance: commission - paid,
        },
        topEarners: stats.topEarners[0]?.earners.map(e => ({
          name: e.details.name,
          totalEarned: (e.withdrawnAmount || 0) + (e.availableBalance || 0),
          withdrawn: e.withdrawnAmount || 0
        })) || []
      }
    });
  } catch (error) {
    console.error('[AdminController] Get finance stats error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch finance stats' });
  }
};

/**
 * Get Payout History (Success/Failed)
 */
export const getPayoutHistory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const { search } = req.query;

    let query = { status: { $in: ['success', 'failed', 'rejected', 'processing'] } };
    
    if (search) {
      const engineers = await Engineer.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.engineerId = { $in: engineers.map(e => e._id) };
    }

    const [payouts, count] = await Promise.all([
      WithdrawalRequest.find(query)
        .populate('engineerId', 'name mobile email')
        .sort({ updatedAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      WithdrawalRequest.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        payouts,
        pagination: {
          total: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          limit
        }
      }
    });
  } catch (error) {
    console.error('[AdminController] Get payout history error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch payout history' });
  }
};


/**
 * Export Ledger to CSV using Worker Threads
 */
export const exportLedger = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = {};
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Ledger.find(query)
      .populate('engineerId', 'name mobile')
      .sort({ createdAt: -1 })
      .lean();

    const workerPath = path.resolve(__dirname, '../utils/csvWorker.js');
    const worker = new Worker(workerPath, { workerData: transactions });

    worker.on('message', (result) => {
      if (result.success) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=ledger_export.csv');
        return res.status(200).send(result.csv);
      } else {
        throw new Error(result.error);
      }
    });

    worker.on('error', (err) => {
      console.error('Worker error:', err);
      res.status(500).json({ success: false, message: 'Export failed' });
    });

  } catch (error) {
    console.error('[AdminController] Export ledger error:', error);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
};
/**
 * Manually trigger re-dispatch for an order (notify engineers again)
 */
export const redispatchOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Reset rejected list if admin wants a fresh start? 
    // For now, let's just trigger notifications.
    const result = await notifyEngineersForOrder(order);

    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        message: result.reason === 'no_engineers' ? 'No nearby engineers found' : 'Failed to dispatch',
        error: result.reason
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Notifications sent to ${result.count} engineers` 
    });
  } catch (error) {
    console.error('[AdminController] Redispatch order error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Manually assign an engineer to an order
 */
export const assignEngineerToOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { engineerId } = req.body;

    const [order, engineer] = await Promise.all([
      Order.findById(orderId),
      Engineer.findById(engineerId)
    ]);

    if (!order || !engineer) {
      return res.status(404).json({ success: false, message: 'Order or Engineer not found' });
    }

    if (order.acceptedBy) {
      return res.status(400).json({ success: false, message: 'Order already has an assigned engineer' });
    }

    // Update order
    order.acceptedBy = engineerId;
    order.assignedEngineer = engineerId; // Depending on which field your schema uses
    order.orderStatus = 'Assigned'; // or 'Upcoming'
    
    // Add tracking
    order.tracking.push({
      status: 'Assigned',
      timestamp: new Date(),
      remarks: `Manually assigned by Admin to ${engineer.name}`
    });

    await order.save();

    // Notify the engineer that they have been assigned
    const io = getIO();
    io.to(engineerId.toString()).emit('ORDER_MANUALLY_ASSIGNED', {
      order_id: orderId,
      orderId: order.orderId,
      message: 'You have been manually assigned to a new job'
    });

    return res.status(200).json({ 
      success: true, 
      message: `Order successfully assigned to ${engineer.name}`,
      data: order
    });
  } catch (error) {
    console.error('[AdminController] Manual assign error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
