import crypto from 'crypto';
import mongoose from 'mongoose';
import { Wallet } from '../models/Wallet.js';
import { Ledger } from '../models/Ledger.js';
import { WithdrawalRequest } from '../models/WithdrawalRequest.js';

/**
 * Handle Razorpay Webhooks (Payouts)
 * Events: payout.processed, payout.failed, payout.reversed
 */
export const handleRazorpayWebhook = async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body; // Needs to be raw string or Buffer

    // 1. Verify Signature
    if (!webhookSecret) {
        console.error("RAZORPAY_WEBHOOK_SECRET is not defined in environment variables");
        return res.status(500).send('Webhook secret not configured');
    }

    try {
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');

        if (signature !== expectedSignature) {
            console.warn("Invalid Razorpay Webhook Signature");
            return res.status(400).send('Invalid signature');
        }
    } catch (err) {
        console.error("Error verifying Razorpay signature:", err);
        return res.status(500).send('Signature verification failed');
    }

    const event = JSON.parse(rawBody);
    const { payload, event: eventType } = event;
    const payout = payload.payout.entity;
    const payoutId = payout.id;
    const referenceId = payout.reference_id;

    console.log(`Processing Webhook Event: ${eventType} for Payout: ${payoutId}`);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const withdrawal = await WithdrawalRequest.findOne({ 
            $or: [{ payoutId }, { _id: referenceId }] 
        }).session(session);

        if (!withdrawal) {
            await session.abortTransaction();
            return res.status(200).send('Withdrawal not found'); // Ack to avoid retry
        }

        // Avoid double processing
        if (withdrawal.status === 'success' || (withdrawal.status === 'failed' && eventType === 'payout.failed')) {
            await session.abortTransaction();
            return res.status(200).send('Already processed');
        }

        const wallet = await Wallet.findOne({ engineerId: withdrawal.engineerId }).session(session);
        const ledger = await Ledger.findOne({ referenceId: withdrawal._id.toString() }).session(session);

        if (eventType === 'payout.processed') {
            // SUCCESS FLOW
            withdrawal.status = 'success';
            withdrawal.processedAt = new Date();
            
            if (ledger) ledger.status = 'success';
            
            // Deduct from locked balance (already deducted from available during request)
            if (wallet) {
                wallet.lockedBalance = Math.max(0, wallet.lockedBalance - withdrawal.amount);
            }

        } else if (eventType === 'payout.failed' || eventType === 'payout.reversed') {
            // FAILURE FLOW
            withdrawal.status = 'failed';
            withdrawal.failureReason = payout.failure_reason || 'Payout failed at bank';
            
            if (ledger) ledger.status = 'failed';

            // Return funds: Move from locked back to available
            if (wallet) {
                wallet.lockedBalance = Math.max(0, wallet.lockedBalance - withdrawal.amount);
                wallet.availableBalance += withdrawal.amount;
            }
        }

        await withdrawal.save({ session });
        if (wallet) await wallet.save({ session });
        if (ledger) await ledger.save({ session });

        await session.commitTransaction();
        session.endSession();
        
        return res.status(200).send('OK');

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error("Webhook Processing Error:", error);
        return res.status(500).send('Internal Server Error');
    }
};
