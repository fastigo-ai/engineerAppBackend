import mongoose from 'mongoose';

const couponUsageSchema = new mongoose.Schema({
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  orderId: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['RESERVED', 'USED', 'FAILED'],
    default: 'RESERVED',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// CRITICAL: Prevent duplicate active reservation
// Only one 'RESERVED' status allowed per user per coupon at a time
couponUsageSchema.index(
  { userId: 1, couponId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'RESERVED' }
  }
);

// Index for cleanup (RESERVED older than 30 mins)
couponUsageSchema.index({ createdAt: 1 });

const CouponUsage = mongoose.model('CouponUsage', couponUsageSchema);
export default CouponUsage;
