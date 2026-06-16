import mongoose from 'mongoose';
import { Wallet } from "../../finance/wallet/Wallet.model.js";
import { Ledger } from "../../finance/ledger/Ledger.model.js";
import { BankAccount } from '../finance/BankAccount.model.js';
import { WithdrawalRequest } from "../../finance/wallet/WithdrawalRequest.model.js";
import { SystemSettings } from "../../admin/api/SystemSettings.model.js";
import { Order } from '../../userOrder/core/userOrder.model.js';
import * as payoutService from "../../finance/payouts/payout.service.js";
import { v4 as uuidv4 } from 'uuid';
import STATUS_CODES from '../../../constants/statusCodes.js';
import { logger } from "../../../config/logger.js";

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

        // Fetch Dynamic Settings
        let settings = await SystemSettings.findOne().session(session);
        if (!settings) {
            settings = {
                platformCommissionRate: 0.25,
                minimumWithdrawalAmount: 500,
                maximumWithdrawalAmount: 50000
            };
        }

        if (!amount || amount < settings.minimumWithdrawalAmount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: `Minimum withdrawal amount is ₹${settings.minimumWithdrawalAmount}`
            });
        }

        if (amount > settings.maximumWithdrawalAmount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: `Maximum withdrawal amount is ₹${settings.maximumWithdrawalAmount}`
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

        // 3. DYNAMIC COMMISSION LOGIC
        const commissionRate = settings.platformCommissionRate;
        const commission = amount * commissionRate;
        const netPayout = amount - commission;

        logger.info({
            event: "WITHDRAWAL_REQUESTED",
            engineerId,
            grossAmount: amount,
            commissionRate,
            commissionFee: commission,
            netPayout,
            requestId: req.id
        });

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
            platformCommissionRateApplied: commissionRate, // Historical Snapshot
            commission,       // Platform Fee
            netAmount: netPayout, // What engineer gets
            status: 'requested'
        });
        await withdrawal.save({ session });

        // NOTE: Ledger DEBIT entry is ONLY created when admin approves and bank payout is successful.

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
        logger.error({ event: "WITHDRAWAL_REQUEST_ERROR", engineerId, error: error.message, requestId: req.id });
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
            const VendorOrder = (await import('../../vendorOrder/core/vendorOrder.model.js')).default;
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
                transactionType: 'CREDIT',
                status: 'success'
            }).select('referenceId').lean();
            const existingIds = new Set(existingLedgerEntries.map(l => l.referenceId?.toString()));

            // E. Create missing Ledger entries
            const { creditEngineerWallet } = await import('../../finance/wallet/wallet.service.js');
            for (const cred of potentialCredits) {
                if (!existingIds.has(cred.id.toString()) && cred.amount > 0) {
                    logger.info({
                        event: "LEDGER_SYNC",
                        engineerId,
                        orderId: cred.id.toString(),
                        amount: cred.amount,
                        requestId: req.id
                    });
                    await creditEngineerWallet({
                        engineerId,
                        amount: cred.amount,
                        orderId: cred.id.toString(),
                        type: 'ORDER_EARNING',
                        transactionType: 'CREDIT',
                        earningStatus: 'PENDING'
                    });
                }
            }
        } catch (syncError) {
            logger.error({ event: "WALLET_SYNC_ERROR", engineerId, error: syncError.message, requestId: req.id });
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
                    _id: "$transactionType",
                    total: { $sum: "$amount" }
                }
            }
        ]);

        const credits = ledgerAggregation.find(i => i._id === 'CREDIT')?.total || 0;
        const debits = ledgerAggregation.find(i => i._id === 'DEBIT')?.total || 0;
        const actualBalance = credits - debits;

        // Auto-reconcile balance if discrepancy exists
        if (wallet.availableBalance !== actualBalance) {
            wallet.availableBalance = actualBalance;
            await wallet.save();
            logger.info({
                event: "WALLET_RECONCILED",
                engineerId,
                actualBalance,
                requestId: req.id
            });
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

        // Backward Compatibility Mapping for the Engineer App Frontend
        const mappedTransactions = transactions.map(tx => {
            const txObj = tx.toObject ? tx.toObject() : tx;
            
            // Map the new fields back to what the frontend expects
            if (txObj.transactionType) {
                txObj.type = txObj.transactionType.toLowerCase(); // 'CREDIT' -> 'credit'
                
                // Map the new 'type' to the old 'category'
                const typeMap = {
                    'ORDER_EARNING': 'earning',
                    'WITHDRAWAL_SUCCESS': 'withdrawal',
                    'BONUS': 'bonus',
                    'PENALTY': 'penalty',
                    'ADJUSTMENT': 'earning'
                };
                txObj.category = typeMap[txObj.type] || 'earning';
            }
            return txObj;
        });

        return res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            data: mappedTransactions
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
