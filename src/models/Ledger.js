import mongoose from 'mongoose';

const LedgerSchema = new mongoose.Schema({
    engineerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Engineer',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    category: {
        type: String,
        enum: ['earning', 'withdrawal', 'bonus', 'penalty'],
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
    referenceId: {
        type: String,
        required: true
    },
    idempotencyKey: {
        type: String,
        required: true,
        unique: true,
        index: true
    }
}, {
    timestamps: true
});

// Compound index for status and createdAt for auditing
LedgerSchema.index({ status: 1, createdAt: -1 });

export const Ledger = mongoose.model('Ledger', LedgerSchema);
