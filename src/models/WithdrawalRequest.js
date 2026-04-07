import mongoose from 'mongoose';

const WithdrawalRequestSchema = new mongoose.Schema({
    engineerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Engineer',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 100 // Min withdrawal limit
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'success', 'failed'],
        default: 'pending',
        index: true
    },
    payoutId: {
        type: String, // From Razorpay
        index: true
    },
    failureReason: {
        type: String
    },
    processedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Index for search and audit
WithdrawalRequestSchema.index({ status: 1, createdAt: -1 });

export const WithdrawalRequest = mongoose.model('WithdrawalRequest', WithdrawalRequestSchema);
