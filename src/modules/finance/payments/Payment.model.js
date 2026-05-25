import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  razorpayPaymentId: {
    type: String,
    trim: true,
    index: true
  },
  razorpayOrderId: {
    type: String,
    required: true,
    trim: true
  },
  razorpaySignature: {
    type: String,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    uppercase: true
  },
  status: {
    type: String,
    enum: ['authorized', 'captured', 'failed', 'refunded', 'pending'],
    default: 'pending',
    index: true
  },
  method: {
    type: String,
    enum: ['card', 'netbanking', 'upi', 'wallet', 'emi', 'other'],
    trim: true
  },
  bank: {
    type: String,
    trim: true
  },
  wallet: {
    type: String,
    trim: true
  },
  vpa: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  contact: {
    type: String,
    trim: true
  },
  fee: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  errorCode: {
    type: String,
    trim: true
  },
  errorDescription: {
    type: String,
    trim: true
  },
  errorSource: {
    type: String,
    trim: true
  },
  errorStep: {
    type: String,
    trim: true
  },
  errorReason: {
    type: String,
    trim: true
  },
  capturedAt: {
    type: Date
  },
  refundStatus: {
    type: String,
    enum: ['null', 'partial', 'full'],
    default: 'null'
  },
  refundAmount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'payments'
});

// Indexes for faster queries
PaymentSchema.index({ userId: 1, status: 1 });
PaymentSchema.index({ createdAt: -1 });

export const Payment = mongoose.model('Payment', PaymentSchema);