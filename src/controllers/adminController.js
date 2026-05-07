import { Order } from '../models/orderSchema.js';
import { WithdrawalRequest } from '../models/WithdrawalRequest.js';
import { Wallet } from '../models/Wallet.js';
import { Ledger } from '../models/Ledger.js';
import { BankAccount } from '../models/BankAccount.js';
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
