import mongoose from 'mongoose';

const LedgerSchema = new mongoose.Schema({
    engineerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Engineer',
        required: true,
        index: true
    },
    transactionType: {
        type: String,
        enum: ['CREDIT', 'DEBIT'],
        required: true
    },
    type: {
        type: String,
        enum: ['ORDER_EARNING', 'WITHDRAWAL_SUCCESS', 'ADJUSTMENT', 'BONUS', 'PENALTY'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'failed', 'rejected'],
        default: 'pending',
        index: true
    },
    earningStatus: {
        type: String,
        enum: ['PENDING', 'AVAILABLE', 'SETTLED'],
        default: 'PENDING',
        index: true
    },
    referenceId: {
        type: String,
        required: true
    },
    idempotencyKey: {
        type: String,
        required: true,
        index: true
    }
}, {
    timestamps: true
});

// Compound index for status and createdAt for auditing
LedgerSchema.index({ status: 1, createdAt: -1 });

// Unique compound index to prevent duplicate credits for the same order and type
LedgerSchema.index({ referenceId: 1, type: 1 }, { unique: true });

export const Ledger = mongoose.model('Ledger', LedgerSchema);
