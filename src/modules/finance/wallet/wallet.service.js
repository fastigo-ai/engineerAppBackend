import mongoose from 'mongoose';
import { Wallet } from './Wallet.model.js';
import { Ledger } from '../ledger/Ledger.model.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Credits the engineer's wallet with the full job amount.
 * 
 * @param {Object} params
 * @param {string} params.engineerId - The engineer's ID
 * @param {number} params.amount - The full amount to credit
 * @param {string} params.orderId - The associated order ID
 * @param {string} params.type - Ledger entry type (e.g. 'ORDER_EARNING')
 * @param {string} params.transactionType - 'CREDIT' or 'DEBIT'
 * @param {string} params.earningStatus - 'PENDING', 'AVAILABLE', 'SETTLED'
 * @param {Object} params.externalSession - Optional Mongoose session for distributed transactions
 */
export const creditEngineerWallet = async ({ engineerId, amount, orderId, type = 'ORDER_EARNING', transactionType = 'CREDIT', earningStatus = 'PENDING', externalSession = null }) => {
    const session = externalSession || await mongoose.startSession();
    if (!externalSession) session.startTransaction();

    try {
        console.log(`Crediting Wallet for Engineer: ${engineerId}, Amount: ${amount}, Order: ${orderId}`);

        // 1. Prepare Atomic Update
        const incUpdate = { 
            availableBalance: transactionType === 'CREDIT' ? amount : -amount
        };
        
        // Only increment lifetime earnings for actual new earnings
        if (transactionType === 'CREDIT' && (type === 'ORDER_EARNING' || type === 'BONUS')) {
            incUpdate.lifetimeEarnings = amount;
        }

        // 2. Update Wallet Atomically
        let wallet = await Wallet.findOneAndUpdate(
            { engineerId },
            { $inc: incUpdate },
            { new: true, upsert: true, session }
        );

        // 3. Create Immutable Ledger Entry
        const ledger = new Ledger({
            engineerId,
            transactionType,
            type,
            amount,
            status: 'success',
            earningStatus,
            referenceId: orderId
        });
        await ledger.save({ session });

        if (!externalSession) {
            await session.commitTransaction();
            session.endSession();
        }
        
        return { success: true, wallet };

    } catch (error) {
        if (!externalSession) {
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            session.endSession();
        }
        console.error("Credit Wallet Error:", error);
        throw error;
    }
};
