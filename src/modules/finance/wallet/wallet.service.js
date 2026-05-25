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
 * @param {string} params.category - 'earning', 'bonus', etc.
 */
export const creditEngineerWallet = async ({ engineerId, amount, orderId, category = 'earning' }) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log(`Crediting Wallet for Engineer: ${engineerId}, Amount: ${amount}, Order: ${orderId}`);

        // 1. Find or Create Wallet
        let wallet = await Wallet.findOne({ engineerId }).session(session);
        if (!wallet) {
            wallet = new Wallet({ engineerId, availableBalance: 0, lockedBalance: 0 });
        }

        // 2. Update Balance (100% Gross)
        wallet.availableBalance += amount;
        await wallet.save({ session });

        // 3. Create Ledger Entry (Success)
        const ledger = new Ledger({
            engineerId,
            type: 'credit',
            category,
            amount,
            status: 'success',
            referenceId: orderId,
            idempotencyKey: uuidv4() // Unique key for this credit
        });
        await ledger.save({ session });

        await session.commitTransaction();
        session.endSession();
        
        return { success: true, wallet };

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error("Credit Wallet Error:", error);
        throw error;
    }
};
