import mongoose from 'mongoose';
import { Wallet } from "../../modules/finance/wallet/Wallet.model.js";
import { Ledger } from "../../modules/finance/ledger/Ledger.model.js";
import { BankAccount } from '../../models/BankAccount.js';
import { WithdrawalRequest } from "../../modules/finance/wallet/WithdrawalRequest.model.js";
import { Order } from '../../models/orderSchema.js';
import * as payoutService from "../../modules/finance/payouts/payout.service.js";
import { v4 as uuidv4 } from 'uuid';
import STATUS_CODES from '../../constants/statusCodes.js';

/**
 * Request a withdrawal from wallet
 * Flow: Validate -> Transaction (Debit Available, Credit Locked) -> Call Razorpay
 */
export const requestWithdrawal = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const engineerId = req.user.id;
        const { amount } = req.body;

        if (!amount || amount < 100) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: "Minimum withdrawal amount is ₹100"
            });
        }

        // 1. Validate Bank Account
        const bankAccount = await BankAccount.findOne({ engineerId, isVerified: true }).session(session);
        if (!bankAccount) {
            await session.abortTransaction();
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: "Verified bank account not found"
            });
        }

        // 2. Check Balance
        const wallet = await Wallet.findOne({ engineerId }).session(session);
        if (!wallet || wallet.availableBalance < amount) {
            await session.abortTransaction();
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: "Insufficient balance"
            });
        }

        const idempotencyKey = uuidv4();
        const requestId = new mongoose.Types.ObjectId();

        // 3. COMMISSION LOGIC (25% Platform, 75% Engineer)
        const commission = amount * 0.25;
        const netPayout = amount - commission;

        console.log(`Withdrawal Request - Gross: ${amount}, Commission: ${commission}, Net Payout: ${netPayout}`);


        // 4. INTERNAL TRANSACTIONAL ACCOUNTING
        // Move Gross amount from available to locked
        wallet.availableBalance -= amount;
        wallet.lockedBalance += amount;
        await wallet.save({ session });

        // Create Withdrawal Request (requested) with commission audit
        const withdrawal = new WithdrawalRequest({
            _id: requestId,
            engineerId,
            amount,           // Total requested (Gross)
            commission,       // Platform Fee
            netAmount: netPayout, // What engineer gets
            status: 'requested'
        });
        await withdrawal.save({ session });

        // Create Ledger Entry (debit, pending)
        const ledger = new Ledger({
            engineerId,
            type: 'debit',
            category: 'withdrawal',
            amount, // Full amount including commission
            status: 'pending',
            referenceId: requestId.toString(),
            idempotencyKey
        });
        await ledger.save({ session });

        // COMMIT TRANSACTION
        await session.commitTransaction();
        session.endSession();

        return res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            message: `Withdrawal request submitted for admin approval. ₹${netPayout} will be transferred to your bank after approval.`,
            data: { requestId, netAmount: netPayout }
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error("Withdrawal Controller Error:", error);
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Get Wallet Balance and Status
 */
export const getWalletBalance = async (req, res) => {
    try {
        const engineerId = req.user.id;

        // --- 1. PROACTIVE LEDGER SYNC (Find missing earnings) ---
        try {
            // A. Find all completed/paid regular orders
            const completedRegularOrders = await Order.find({
                assignedEngineer: engineerId,
                $or: [{ status: 'paid' }, { orderStatus: 'Completed' }]
            }).select('_id amount').lean();

            // B. Find all completed vendor orders
            const VendorOrder = (await import('../../models/vendorOrderModal.js')).default;
            const completedVendorOrders = await VendorOrder.find({
                assigned_engineer_id: engineerId,
                work_status: 'COMPLETED'
            }).select('_id order_price payout_amount').lean();

            // C. Combine All Potential Credits
            const potentialCredits = [
                ...completedRegularOrders.map(o => ({ id: o._id, amount: o.amount || 0 })),
                ...completedVendorOrders.map(o => ({ id: o._id, amount: o.payout_amount || o.order_price || 0 }))
            ];

            // D. Get existing success credits in Ledger
            const existingLedgerEntries = await Ledger.find({
                engineerId,
                type: 'credit',
                status: 'success'
            }).select('referenceId').lean();
            const existingIds = new Set(existingLedgerEntries.map(l => l.referenceId?.toString()));

            // E. Create missing Ledger entries
            const { creditEngineerWallet } = await import('../../services/walletService.js');
            for (const cred of potentialCredits) {
                if (!existingIds.has(cred.id.toString()) && cred.amount > 0) {
                    console.log(`Syncing missing credit for order ${cred.id}: ₹${cred.amount}`);
                    await creditEngineerWallet({
                        engineerId,
                        amount: cred.amount,
                        orderId: cred.id.toString(),
                        category: 'earning'
                    });
                }
            }
        } catch (syncError) {
            console.error("Wallet Sync Error:", syncError);
            // Don't block the balance return if sync fails
        }

        let wallet = await Wallet.findOne({ engineerId });

        if (!wallet) {
            // Create default wallet if not exists
            wallet = await Wallet.create({ engineerId, availableBalance: 0, lockedBalance: 0 });
        }

        // Verify balance against ledger (Source of Truth check)
        const ledgerAggregation = await Ledger.aggregate([
            { $match: { engineerId: new mongoose.Types.ObjectId(engineerId), status: 'success' } },
            { 
                $group: {
                    _id: "$type",
                    total: { $sum: "$amount" }
                }
            }
        ]);

        const credits = ledgerAggregation.find(i => i._id === 'credit')?.total || 0;
        const debits = ledgerAggregation.find(i => i._id === 'debit')?.total || 0;
        const actualBalance = credits - debits;

        // Auto-reconcile balance if discrepancy exists
        if (wallet.availableBalance !== actualBalance) {
            wallet.availableBalance = actualBalance;
            await wallet.save();
            console.log(`Reconciled wallet balance for engineer ${engineerId} to ₹${actualBalance}`);
        }

        return res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            data: {
                availableBalance: wallet.availableBalance,
                lockedBalance: wallet.lockedBalance,
                verifiedBalance: actualBalance, // Audit trace
                updatedAt: wallet.updatedAt
            }
        });
    } catch (error) {
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Get Transaction History
 */
export const getTransactionHistory = async (req, res) => {
    try {
        const engineerId = req.user.id;
        const transactions = await Ledger.find({ engineerId })
            .sort({ createdAt: -1 })
            .limit(50);

        return res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            data: transactions
        });
    } catch (error) {
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Get Engineer's Bank Account Details
 */
export const getBankAccount = async (req, res) => {
    try {
        const engineerId = req.user.id || req.user.userId;
        const bankAccount = await BankAccount.findOne({ engineerId });

        if (!bankAccount) {
            return res.status(STATUS_CODES.SUCCESS).json({
                success: true,
                message: "No bank account found.",
                data: null
            });
        }

        // Mask account number for security: "XXXX XXXX 1234"
        const accStr = bankAccount.accountNumber || '';
        const maskedAcc = accStr.length > 4 ? `XXXX XXXX ${accStr.slice(-4)}` : accStr;

        return res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            data: {
                bankName: bankAccount.bankName,
                maskedAccountNumber: maskedAcc,
                ifscCode: bankAccount.ifsc, // Fixed mapping to match model
                isVerified: bankAccount.isVerified
            }
        });
    } catch (error) {
        console.error("Get Bank Account Error:", error);
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message
        });
    }
};
