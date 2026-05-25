import mongoose from 'mongoose';

const BankAccountSchema = new mongoose.Schema({
    engineerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Engineer',
        required: true,
        unique: true,
        index: true
    },
    accountNumber: {
        type: String,
        required: true,
        trim: true
    },
    ifsc: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    bankName: {
        type: String,
        trim: true
    },
    accountHolderName: {
        type: String,
        required: true,
        trim: true
    },
    fundAccountId: {
        type: String, // From Razorpay
        required: true,
        index: true
    },
    isVerified: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

export const BankAccount = mongoose.model('BankAccount', BankAccountSchema);
