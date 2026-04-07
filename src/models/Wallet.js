import mongoose from 'mongoose';

const WalletSchema = new mongoose.Schema({
    engineerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Engineer',
        required: true,
        unique: true,
        index: true
    },
    availableBalance: {
        type: Number,
        default: 0,
        min: 0
    },
    lockedBalance: {
        type: Number,
        default: 0,
        min: 0
    }
}, {
    timestamps: true
});

export const Wallet = mongoose.model('Wallet', WalletSchema);
