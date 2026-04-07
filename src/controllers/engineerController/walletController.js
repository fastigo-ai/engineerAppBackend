import mongoose from 'mongoose';
import { Wallet } from '../../models/Wallet.js';
import { Ledger } from '../../models/Ledger.js';
import { BankAccount } from '../../models/BankAccount.js';
import { WithdrawalRequest } from '../../models/WithdrawalRequest.js';
import * as payoutService from '../../services/payoutService.js';
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
        // Move funds from available to locked
        wallet.availableBalance -= amount;
        wallet.lockedBalance += amount;
        await wallet.save({ session });

        // Create Withdrawal Request (pending) with commission audit
        const withdrawal = new WithdrawalRequest({
            _id: requestId,
            engineerId,
            amount, // Total requested (Gross)
            status: 'pending'
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

        // COMMIT TRANSACTION BEFORE EXTERNAL API CALL
        await session.commitTransaction();
        session.endSession();

        // 5. CALL RAZORPAY PAYOUT API (After Commit) - Send NET Payout (75%)
        try {
            const payout = await payoutService.createPayout({
                fundAccountId: bankAccount.fundAccountId,
                amount: netPayout,
                referenceId: requestId.toString(),
                idempotencyKey
            });

            // Update with payoutId
            await WithdrawalRequest.findByIdAndUpdate(requestId, {
                status: 'processing',
                payoutId: payout.id
            });

            return res.status(STATUS_CODES.SUCCESS).json({
                success: true,
                message: "Withdrawal request initiated",
                data: { requestId, payoutId: payout.id }
            });

        } catch (payoutError) {
            console.error("Async Payout Trigger Failed:", payoutError);
            return res.status(STATUS_CODES.SUCCESS).json({
                success: true,
                message: "Withdrawal recorded. Processing may be delayed.",
                data: { requestId }
            });
        }

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

        return res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            data: {
                availableBalance: wallet.availableBalance,
                lockedBalance: wallet.lockedBalance,
                verifiedBalance: actualBalance, // For audit visibility
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
        const engineerId = req.user.id;
        const bankAccount = await BankAccount.findOne({ engineerId });

        if (!bankAccount) {
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false,
                message: "Bank account details not found."
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
                ifscCode: bankAccount.ifscCode,
                isVerified: bankAccount.isVerified
            }
        });
    } catch (error) {
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message
        });
    }
};
