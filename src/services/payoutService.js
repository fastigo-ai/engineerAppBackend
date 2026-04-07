import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Service to handle Razorpay Payouts and related entities
 */
export const createContact = async (engineer) => {
    try {
        const contact = await razorpay.contacts.create({
            name: engineer.name,
            email: engineer.email || `${engineer.mobile}@door2fy.com`,
            contact: engineer.mobile,
            type: "employee",
            reference_id: engineer._id.toString(),
        });
        return contact;
    } catch (error) {
        console.error("Razorpay Contact Creation Error:", error);
        throw error;
    }
};

export const createFundAccount = async (contactId, bankDetails) => {
    try {
        const fundAccount = await razorpay.fundAccount.create({
            account_type: "bank_account",
            contact_id: contactId,
            bank_account: {
                name: bankDetails.accountHolderName,
                ifsc: bankDetails.ifsc,
                account_number: bankDetails.accountNumber,
            },
        });
        return fundAccount;
    } catch (error) {
        console.error("Razorpay Fund Account Creation Error:", error);
        throw error;
    }
};

export const createPayout = async ({ fundAccountId, amount, accountNumber, referenceId, idempotencyKey }) => {
    try {
        const payout = await razorpay.payouts.create({
            account_number: accountNumber || process.env.RAZORPAY_ACCOUNT_NUMBER, // Merchant X-account
            fund_account_id: fundAccountId,
            amount: Math.round(amount * 100), // Convert to paise
            currency: "INR",
            mode: "IMPS",
            purpose: "payout",
            queue_if_low_balance: true,
            reference_id: referenceId,
            notes: {
                ledgerReference: referenceId
            }
        }, {
            "X-Payout-Idempotency": idempotencyKey
        });
        return payout;
    } catch (error) {
        console.error("Razorpay Payout Error:", error);
        throw error;
    }
};

export const fetchPayout = async (payoutId) => {
    try {
        return await razorpay.payouts.fetch(payoutId);
    } catch (error) {
        console.error("Razorpay Fetch Payout Error:", error);
        throw error;
    }
};
