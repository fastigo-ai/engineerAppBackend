import axios from 'axios';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const RAZORPAY_KEY = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_ACCOUNT_NUMBER = process.env.RAZORPAY_ACCOUNT_NUMBER;

// Basic Auth for Razorpay
const auth = Buffer.from(`${RAZORPAY_KEY}:${RAZORPAY_SECRET}`).toString('base64');
const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
};

const BASE_URL = 'https://api.razorpay.com/v1';

/**
 * Service to handle Razorpay Payouts and related entities (using REST API)
 */
export const createContact = async (engineer) => {
    try {
        const response = await axios.post(`${BASE_URL}/contacts`, {
            name: engineer.name,
            email: engineer.email || `${engineer.mobile}@door2fy.com`,
            contact: engineer.mobile,
            type: "employee",
            reference_id: engineer._id.toString(),
        }, { headers });

        return response.data;
    } catch (error) {
        const message = error.response?.data?.error?.description || error.message;
        console.error("Razorpay Contact Creation Error:", message);
        throw new Error(message);
    }
};

export const createFundAccount = async (contactId, bankDetails) => {
    try {
        const response = await axios.post(`${BASE_URL}/fund_accounts`, {
            account_type: "bank_account",
            contact_id: contactId,
            bank_account: {
                name: bankDetails.accountHolderName || bankDetails.accountName || "Bank Account",
                ifsc: bankDetails.ifsc,
                account_number: bankDetails.accountNumber,
            },
        }, { headers });

        return response.data;
    } catch (error) {
        const message = error.response?.data?.error?.description || error.message;
        console.error("Razorpay Fund Account Creation Error:", message);
        throw new Error(message);
    }
};

export const createPayout = async ({ fundAccountId, amount, accountNumber, referenceId, idempotencyKey }) => {
    try {
        const accNum = accountNumber || RAZORPAY_ACCOUNT_NUMBER;
        if (!accNum) {
            throw new Error("RAZORPAY_ACCOUNT_NUMBER is missing in .env. This is required for payouts.");
        }

        const response = await axios.post(`${BASE_URL}/payouts`, {
            account_number: accNum,
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
            headers: {
                ...headers,
                "X-Payout-Idempotency": idempotencyKey || uuidv4()
            }
        });

        return response.data;
    } catch (error) {
        const message = error.response?.data?.error?.description || error.message;
        const code = error.response?.data?.error?.code || 'UNKNOWN_ERROR';
        console.error(`Razorpay Payout Error [${code}]:`, message);
        throw new Error(message);
    }
};

export const fetchPayout = async (payoutId) => {
    try {
        const response = await axios.get(`${BASE_URL}/payouts/${payoutId}`, { headers });
        return response.data;
    } catch (error) {
        const message = error.response?.data?.error?.description || error.message;
        console.error("Razorpay Fetch Payout Error:", message);
        throw new Error(message);
    }
};
