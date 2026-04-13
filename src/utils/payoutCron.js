import cron from 'node-cron';
import { WithdrawalRequest } from '../models/WithdrawalRequest.js';
import { BankAccount } from '../models/BankAccount.js';
import { Ledger } from '../models/Ledger.js';
import * as payoutService from '../services/payoutService.js';

/**
 * Cron to retry 'pending' withdrawal requests that failed to reach Razorpay
 * Runs every 5 minutes
 */
export const initPayoutCron = () => {
    cron.schedule('*/5 * * * *', async () => {
        console.log('--- Running Payout Retry Cron ---');

        try {
            // Find requests stuck in 'pending' for more than 5 minutes
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

            const pendingWithdrawals = await WithdrawalRequest.find({
                status: 'pending',
                createdAt: { $lte: fiveMinutesAgo }
            }).limit(20);

            console.log(`Found ${pendingWithdrawals.length} pending withdrawals to retry`);

            for (const withdrawal of pendingWithdrawals) {
                try {
                    const bankAccount = await BankAccount.findOne({ engineerId: withdrawal.engineerId, isVerified: true });
                    const ledger = await Ledger.findOne({ referenceId: withdrawal._id.toString() });

                    if (!bankAccount || !ledger) {
                        console.error(`Missing data for withdrawal retry: ${withdrawal._id}`);
                        continue;
                    }

                    console.log(`Retrying payout for Withdrawal: ${withdrawal._id}`);

                    const payout = await payoutService.createPayout({
                        fundAccountId: bankAccount.fundAccountId,
                        amount: withdrawal.amount,
                        referenceId: withdrawal._id.toString(),
                        idempotencyKey: ledger.idempotencyKey
                    });

                    withdrawal.status = 'processing';
                    withdrawal.payoutId = payout.id;
                    await withdrawal.save();

                    console.log(`Successfully retried Payout: ${payout.id}`);

                } catch (error) {
                    console.error(`Retry attempt failed for Withdrawal: ${withdrawal._id}`, error.message);
                }
            }
        } catch (error) {
            console.error('Payout Cron Error:', error);
        }
    });
};



